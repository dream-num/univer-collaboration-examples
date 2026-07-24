export type ReviewMode = "trunk" | "draft" | "merge";
export type ReviewWorktreeView = "active" | "processed";
export type ReviewWorktreeScope = "all" | "user" | "space";
export type ReviewLifecycleAction =
  | "ready"
  | "reopen"
  | "merge"
  | "discard";

export interface ReviewSpace {
  readonly id: string;
  readonly type: "personal" | "team";
  readonly name: string;
}

export interface ReviewWorktreeUnit {
  readonly unitID: string;
  readonly type: number;
  readonly source: "trunk" | "worktree";
  readonly resourceID: string;
  readonly resourceStatus: string;
  readonly name: string;
  readonly spaceID: string;
  readonly baselineTrunkRevision: number | null;
  readonly draftHeadRevision: number;
  readonly readyDraftHeadRevision?: number;
  readonly mergeResult?: {
    readonly status: "merged" | "unchanged" | "conflict" | "failed";
    readonly trunkRevision?: number;
    readonly error?: {
      readonly code: string;
      readonly message: string;
      readonly retryable: boolean;
    };
  };
}

export interface ReviewWorktree {
  readonly worktreeID: string;
  readonly name: string;
  readonly summary?: string;
  readonly creatorUserID: string;
  readonly creatorName: string;
  readonly scope:
    | { readonly kind: "user"; readonly userID: string }
    | { readonly kind: "space"; readonly spaceID: string };
  readonly visibility: "private" | "space";
  readonly status: "draft" | "ready" | "merging" | "merged" | "discarded";
  readonly units: readonly ReviewWorktreeUnit[];
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly processedAt?: number;
}

export function lifecycleActions(
  worktree: ReviewWorktree
): readonly ReviewLifecycleAction[] {
  switch (worktree.status) {
    case "draft":
      return ["ready", "discard"];
    case "ready":
      return ["reopen", "merge", "discard"];
    case "merging":
      return ["merge"];
    case "merged":
    case "discarded":
      return [];
  }
}

export function reviewUnitUrl(
  worktreeID: string,
  unit: ReviewWorktreeUnit,
  mode: ReviewMode
): string {
  const query = new URLSearchParams({
    reviewWorktree: worktreeID,
    unit: unit.unitID,
    type: String(unit.type),
    reviewMode: mode,
  });
  return `/?${query}`;
}

export function worktreeReviewView(input: {
  readonly worktrees: readonly ReviewWorktree[];
  readonly selectedWorktreeID?: string;
  readonly selectedUnitID?: string;
  readonly mode: ReviewMode;
  readonly view: ReviewWorktreeView;
  readonly scope: ReviewWorktreeScope;
  readonly spaceID?: string;
  readonly spaces: readonly ReviewSpace[];
}): string {
  const selected =
    input.worktrees.find(
      ({ worktreeID }) => worktreeID === input.selectedWorktreeID
    ) ?? input.worktrees[0];
  const unit =
    selected?.units.find(({ unitID }) => unitID === input.selectedUnitID) ??
    selected?.units[0];
  return `
    <section class="worktree-review-heading">
      <div>
        <p class="breadcrumb">Agent Worktrees</p>
        <h1>审阅 Agent 工作</h1>
        <p>内容预览为只读。你可以检查结果并执行生命周期操作。</p>
      </div>
      <span class="review-readonly-badge">只读 Review</span>
    </section>
    <section class="worktree-review-filters" aria-label="Worktree 筛选">
      <div class="review-segmented">
        ${filterButton("view", "active", "进行中", input.view)}
        ${filterButton("view", "processed", "已处理", input.view)}
      </div>
      <div class="review-segmented">
        ${filterButton("scope", "all", "全部", input.scope)}
        ${filterButton("scope", "user", "个人", input.scope)}
        ${filterButton("scope", "space", "团队空间", input.scope)}
      </div>
      ${
        input.scope === "space"
          ? `<select data-worktree-space aria-label="团队空间">
              <option value="">所有团队空间</option>
              ${input.spaces
                .filter(({ type }) => type === "team")
                .map(
                  (space) =>
                    `<option value="${escapeHtml(space.id)}"${
                      space.id === input.spaceID ? " selected" : ""
                    }>${escapeHtml(space.name)}</option>`
                )
                .join("")}
            </select>`
          : ""
      }
    </section>
    <section class="worktree-review-layout">
      <aside class="worktree-review-list" aria-label="Worktree 列表">
        <div class="review-list-heading">
          <strong>${input.view === "active" ? "进行中" : "已处理"}</strong>
          <span>${input.worktrees.length}</span>
        </div>
        ${
          input.worktrees.length
            ? input.worktrees
                .map((worktree) =>
                  worktreeListItem(
                    worktree,
                    worktree.worktreeID === selected?.worktreeID
                  )
                )
                .join("")
            : `<div class="review-empty">
                <strong>没有 Worktree</strong>
                <p>Agent 创建的工作会显示在这里。</p>
              </div>`
        }
      </aside>
      <div class="worktree-review-detail">
        ${
          selected
            ? worktreeDetail(selected, unit, input.mode)
            : `<div class="review-empty review-empty-large">
                <strong>选择一个 Worktree</strong>
                <p>查看 Unit、revision 和合并结果。</p>
              </div>`
        }
      </div>
    </section>
  `;
}

function worktreeListItem(
  worktree: ReviewWorktree,
  selected: boolean
): string {
  return `
    <button
      class="worktree-review-item${selected ? " active" : ""}"
      type="button"
      data-worktree-select="${escapeHtml(worktree.worktreeID)}"
    >
      <span class="review-item-top">
        <strong>${escapeHtml(worktree.name)}</strong>
        <i class="review-status review-status-${worktree.status}">${statusLabel(worktree.status)}</i>
      </span>
      <span>${escapeHtml(worktree.creatorName)} · ${scopeLabel(worktree)}</span>
      <small>${worktree.units.length} 个 Unit · ${formatTime(worktree.updatedAt)}</small>
    </button>
  `;
}

function worktreeDetail(
  worktree: ReviewWorktree,
  selectedUnit: ReviewWorktreeUnit | undefined,
  mode: ReviewMode
): string {
  const actions = lifecycleActions(worktree);
  return `
    <header class="worktree-detail-header">
      <div>
        <div class="review-title-line">
          <h2>${escapeHtml(worktree.name)}</h2>
          <span class="review-visibility">${worktree.visibility === "private" ? "仅创建者" : "团队可见"}</span>
        </div>
        <p>${escapeHtml(worktree.summary ?? "没有摘要")}</p>
        <dl class="review-metadata">
          <div><dt>创建者</dt><dd>${escapeHtml(worktree.creatorName)}</dd></div>
          <div><dt>范围</dt><dd>${scopeLabel(worktree)}</dd></div>
          <div><dt>状态</dt><dd>${statusLabel(worktree.status)}</dd></div>
          <div><dt>更新时间</dt><dd>${formatTime(worktree.updatedAt)}</dd></div>
        </dl>
      </div>
      <div class="worktree-actions">
        ${actions
          .map(
            (action) =>
              `<button
                type="button"
                class="${action === "merge" || action === "ready" ? "primary-button" : "secondary-button"}"
                data-worktree-action="${action}"
                data-worktree-id="${escapeHtml(worktree.worktreeID)}"
              >${actionLabel(action)}</button>`
          )
          .join("")}
      </div>
    </header>
    <div class="worktree-unit-review">
      <nav class="worktree-unit-list" aria-label="Worktree Units">
        <h3>Units</h3>
        ${
          worktree.units.length
            ? worktree.units
                .map(
                  (unit) => `
                    <button
                      type="button"
                      data-worktree-unit="${escapeHtml(unit.unitID)}"
                      class="${unit.unitID === selectedUnit?.unitID ? "active" : ""}"
                    >
                      <span class="unit-type unit-type-${unit.type}">${unitTypeLabel(unit.type)}</span>
                      <strong>${escapeHtml(unit.name)}</strong>
                      <small>draft r${unit.draftHeadRevision}</small>
                      ${mergeResult(unit)}
                    </button>`
                )
                .join("")
            : `<div class="review-empty"><p>这个 Worktree 还没有 Unit。</p></div>`
        }
      </nav>
      <div class="worktree-unit-preview">
        ${selectedUnit ? unitPreview(worktree, selectedUnit, mode) : ""}
      </div>
    </div>
  `;
}

function unitPreview(
  worktree: ReviewWorktree,
  unit: ReviewWorktreeUnit,
  requestedMode: ReviewMode
): string {
  const modes = availableModes(worktree, unit);
  const mode = modes.includes(requestedMode) ? requestedMode : modes[0]!;
  return `
    <div class="review-preview-toolbar">
      <div>
        <strong>${escapeHtml(unit.name)}</strong>
        <span>baseline ${unit.baselineTrunkRevision === null ? "new" : `r${unit.baselineTrunkRevision}`} → draft r${unit.draftHeadRevision}</span>
      </div>
      <div class="review-mode-switch" aria-label="预览版本">
        ${modes
          .map(
            (candidate) =>
              `<button type="button" data-review-mode="${candidate}" class="${candidate === mode ? "active" : ""}">${modeLabel(candidate)}</button>`
          )
          .join("")}
      </div>
      <span class="review-readonly-badge">只读预览</span>
    </div>
    <iframe
      class="worktree-preview-frame"
      title="${escapeHtml(unit.name)} ${modeLabel(mode)}"
      src="${escapeHtml(reviewUnitUrl(worktree.worktreeID, unit, mode))}"
    ></iframe>
  `;
}

function availableModes(
  worktree: ReviewWorktree,
  unit: ReviewWorktreeUnit
): readonly ReviewMode[] {
  return [
    ...(unit.source === "trunk" ? (["trunk"] as const) : []),
    "draft" as const,
    ...(unit.source === "trunk" && worktree.status === "ready"
      ? (["merge"] as const)
      : []),
  ];
}

function mergeResult(unit: ReviewWorktreeUnit): string {
  if (!unit.mergeResult) return "";
  const result = unit.mergeResult;
  const label = {
    merged: "已合并",
    unchanged: "无变更",
    conflict: "合并冲突",
    failed: "合并失败",
  }[result.status];
  return `<span class="unit-merge-result unit-merge-${result.status}">
    ${label}${
      result.error
        ? ` · ${escapeHtml(result.error.code)}${result.error.retryable ? " · 可重试" : ""}`
        : ""
    }
  </span>`;
}

function filterButton(
  kind: "view" | "scope",
  value: string,
  label: string,
  current: string
): string {
  return `<button type="button" data-worktree-${kind}="${value}" class="${value === current ? "active" : ""}">${label}</button>`;
}

function scopeLabel(worktree: ReviewWorktree): string {
  return worktree.scope.kind === "user" ? "个人 Worktree" : "团队空间";
}

function statusLabel(status: ReviewWorktree["status"]): string {
  return {
    draft: "草稿",
    ready: "待审阅",
    merging: "合并中",
    merged: "已合并",
    discarded: "已丢弃",
  }[status];
}

function actionLabel(action: ReviewLifecycleAction): string {
  return {
    ready: "提交审阅",
    reopen: "重新打开",
    merge: "合并",
    discard: "丢弃",
  }[action];
}

function modeLabel(mode: ReviewMode): string {
  return { trunk: "主线", draft: "Worktree", merge: "合入预览" }[mode];
}

function unitTypeLabel(type: number): string {
  return { 1: "Doc", 2: "Sheet", 3: "Slide" }[type] ?? `Unit ${type}`;
}

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
