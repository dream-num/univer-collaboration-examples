import { UniverType } from "@univerjs/protocol";

export type ReviewMode = "trunk" | "draft" | "merge";
export type DocumentChangeKind =
  | "modified"
  | "added"
  | "deleted"
  | "unchanged";
export type ReviewWorktreeFilter =
  | "all"
  | "running"
  | "ready"
  | "processed";
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
      return ["discard", "ready"];
    case "ready":
      return ["discard", "merge"];
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
  readonly filter: ReviewWorktreeFilter;
  readonly scope: ReviewWorktreeScope;
  readonly spaceID?: string;
  readonly spaces: readonly ReviewSpace[];
}): string {
  const groups = groupWorktrees(input.worktrees);
  const visible = visibleWorktrees(groups, input.filter);
  const defaultSelection =
    input.filter === "all"
      ? [...groups.running, ...groups.ready][0]
      : visible[0];
  const selected = input.selectedWorktreeID
    ? (visible.find(
        ({ worktreeID }) => worktreeID === input.selectedWorktreeID
      ) ?? defaultSelection)
    : defaultSelection;
  const unit =
    selected?.units.find(({ unitID }) => unitID === input.selectedUnitID) ??
    selected?.units[0];
  return `
    <div class="worktree-review-page">
      <section class="worktree-review-heading">
        <div>
          <h1>智能工作台</h1>
          <p>查看 AI 正在进行/已完成的文档任务，确认后纳入正式版本。</p>
        </div>
      </section>
      <section class="worktree-review-filters" aria-label="文档任务筛选">
        <div class="review-segmented">
          ${filterButton("filter", "all", "全部", input.filter)}
          ${filterButton("filter", "running", "正在进行", input.filter)}
          ${filterButton("filter", "ready", "待确认", input.filter)}
          ${filterButton("filter", "processed", "已处理", input.filter)}
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
        <button class="review-panel-toggle" type="button" data-task-panel-toggle aria-expanded="true">
          <span aria-hidden="true">‹</span><b>收起任务列表</b>
        </button>
      </section>
      <section class="worktree-review-layout">
        <aside class="worktree-task-tree" aria-label="任务与文档">
          ${taskGroup("正在进行", "running", groups.running, selected, unit, input.filter)}
          ${taskGroup("待确认", "ready", groups.ready, selected, unit, input.filter)}
          ${taskGroup("已处理", "processed", groups.processed, selected, unit, input.filter)}
          ${
            visible.length
              ? ""
              : `<div class="review-empty">
                  <strong>没有文档任务</strong>
                  <p>AI 创建的工作会显示在这里。</p>
                </div>`
          }
        </aside>
        <div class="worktree-review-detail">
          ${
            selected
              ? worktreeDetail(selected, unit, input.mode)
              : `<div class="review-empty review-empty-large">
                  <strong>选择一个文档任务</strong>
                  <p>在左侧选择文档，查看 AI 的处理结果。</p>
                </div>`
          }
        </div>
      </section>
    </div>
  `;
}

type WorktreeGroup = "running" | "ready" | "processed";

function groupWorktrees(worktrees: readonly ReviewWorktree[]): Record<WorktreeGroup, readonly ReviewWorktree[]> {
  return {
    running: worktrees.filter(({ status }) => status === "draft" || status === "merging"),
    ready: worktrees.filter(({ status }) => status === "ready"),
    processed: worktrees.filter(({ status }) => status === "merged" || status === "discarded"),
  };
}

function visibleWorktrees(
  groups: Record<WorktreeGroup, readonly ReviewWorktree[]>,
  filter: ReviewWorktreeFilter
): readonly ReviewWorktree[] {
  if (filter === "all") {
    return [...groups.running, ...groups.ready, ...groups.processed];
  }
  return groups[filter];
}

function taskGroup(
  label: string,
  group: WorktreeGroup,
  worktrees: readonly ReviewWorktree[],
  selectedWorktree: ReviewWorktree | undefined,
  selectedUnit: ReviewWorktreeUnit | undefined,
  filter: ReviewWorktreeFilter
): string {
  if (filter !== "all" && filter !== group) return "";
  const groupOpen = group !== "processed" || filter === "processed";
  return `
    <details class="task-tree-group task-tree-group-${group}"${groupOpen ? " open" : ""}>
      <summary>
        <span class="task-tree-chevron" aria-hidden="true">›</span>
        <strong>${label}</strong>
        <span class="task-tree-count">${worktrees.length}</span>
      </summary>
      <div class="task-tree-branches">
        ${worktrees
          .map((worktree) =>
            taskTreeItem(
              worktree,
              worktree.worktreeID === selectedWorktree?.worktreeID,
              worktree.worktreeID === selectedWorktree?.worktreeID
                ? selectedUnit
                : undefined,
              group !== "processed" ||
                (filter === "processed" &&
                  worktree.worktreeID === selectedWorktree?.worktreeID)
            )
          )
          .join("")}
      </div>
    </details>`;
}

function taskTreeItem(
  worktree: ReviewWorktree,
  selected: boolean,
  selectedUnit: ReviewWorktreeUnit | undefined,
  defaultOpen: boolean
): string {
  const changeSummary = documentChangeSummary(worktree.units);
  return `
    <details class="task-tree-item${selected ? " active" : ""}"${defaultOpen ? " open" : ""}>
      <summary>
        <span class="task-tree-chevron" aria-hidden="true">›</span>
        <span class="task-tree-title">
          <strong>${escapeHtml(worktree.name)}</strong>
          <small>${escapeHtml(worktree.creatorName)} · ${formatTime(worktree.updatedAt)}</small>
          <small class="task-change-summary">${changeSummary}</small>
        </span>
        <i class="review-status review-status-${worktree.status}">${statusLabel(worktree.status)}</i>
      </summary>
      <div class="task-document-list">
        ${
          worktree.units.length
            ? worktree.units
                .map((unit) => {
                  const changeKind = documentChangeKind(unit);
                  return `
                    <button
                      type="button"
                      data-worktree-id="${escapeHtml(worktree.worktreeID)}"
                      data-worktree-unit="${escapeHtml(unit.unitID)}"
                      class="task-document-item document-change-${changeKind}${unit.unitID === selectedUnit?.unitID ? " active" : ""}"
                    >
                      <span class="task-document-branch" aria-hidden="true"></span>
                      <span class="unit-type unit-type-${unit.type}">${unitTypeLabel(unit.type)}</span>
                      <span class="task-document-title">
                        <strong>${escapeHtml(unit.name)}</strong>
                        <small>${documentVersionLabel(unit)}</small>
                        ${mergeResult(unit)}
                      </span>
                      ${documentChangeBadge(changeKind)}
                    </button>`;
                })
                .join("")
            : `<div class="review-empty"><p>这个任务还没有文档。</p></div>`
        }
      </div>
    </details>
  `;
}

function worktreeDetail(
  worktree: ReviewWorktree,
  selectedUnit: ReviewWorktreeUnit | undefined,
  mode: ReviewMode
): string {
  const actions = lifecycleActions(worktree);
  return `
    <div class="worktree-unit-preview">
      ${selectedUnit ? unitPreview(worktree, selectedUnit, mode, actions) : ""}
    </div>
    <details class="worktree-task-information">
      <summary><span aria-hidden="true">ⓘ</span><strong>任务信息</strong><span class="task-information-chevron" aria-hidden="true">⌃</span></summary>
      <dl class="review-metadata">
        <div><dt>负责人</dt><dd>${escapeHtml(worktree.creatorName)}</dd></div>
        <div><dt>任务类型</dt><dd>${scopeLabel(worktree)}</dd></div>
        <div><dt>状态</dt><dd>${statusLabel(worktree.status)}</dd></div>
        <div><dt>更新时间</dt><dd>${formatTime(worktree.updatedAt)}</dd></div>
      </dl>
    </details>
  `;
}

function unitPreview(
  worktree: ReviewWorktree,
  unit: ReviewWorktreeUnit,
  requestedMode: ReviewMode,
  actions: readonly ReviewLifecycleAction[]
): string {
  const modes = availableModes(worktree, unit);
  const mode = modes.includes(requestedMode) ? requestedMode : modes[0]!;
  const changeKind = documentChangeKind(unit);
  return `
    <header class="worktree-detail-header">
      <div class="review-title-line">
        <span>${escapeHtml(worktree.name)} · ${statusLabel(worktree.status)}</span>
        <div class="review-unit-heading">
          ${documentChangeBadge(changeKind)}
          <h2>${escapeHtml(unit.name)}</h2>
        </div>
        <small>${escapeHtml(worktree.summary ?? "没有任务说明")} · ${documentVersionLabel(unit)}</small>
      </div>
      <div class="review-preview-controls">
        <div class="review-mode-switch" aria-label="预览版本">
          ${modes
            .map(
              (candidate) =>
                `<button type="button" data-review-mode="${candidate}" class="${candidate === mode ? "active" : ""}">${modeLabel(candidate)}</button>`
            )
            .join("")}
        </div>
        <span class="review-readonly-badge">只读预览</span>
        <button
          class="review-expand-button"
          type="button"
          data-review-expand
          aria-controls="worktree-preview-frame"
          aria-expanded="false"
        ><span aria-hidden="true">↗</span><b>沉浸预览</b></button>
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
    <iframe
      id="worktree-preview-frame"
      class="worktree-preview-frame"
      title="${escapeHtml(unit.name)} ${modeLabel(mode)}"
      src="${escapeHtml(reviewUnitUrl(worktree.worktreeID, unit, mode))}"
    ></iframe>
  `;
}

export function documentChangeKind(
  unit: ReviewWorktreeUnit
): DocumentChangeKind {
  if (unit.resourceStatus === "deleted") return "deleted";
  if (unit.source === "worktree") return "added";
  if (unit.mergeResult?.status === "unchanged") return "unchanged";
  return documentDraftRevision(unit) === unit.baselineTrunkRevision
    ? "unchanged"
    : "modified";
}

function documentChangeBadge(kind: DocumentChangeKind): string {
  const badge = {
    modified: ["✎", "修改"],
    added: ["＋", "新增"],
    deleted: ["×", "删除"],
    unchanged: ["—", "未改动"],
  }[kind];
  return `<span class="document-change-badge document-change-badge-${kind}">
    <span aria-hidden="true">${badge[0]}</span>${badge[1]}
  </span>`;
}

function documentChangeSummary(
  units: readonly ReviewWorktreeUnit[]
): string {
  const counts: Record<DocumentChangeKind, number> = {
    modified: 0,
    added: 0,
    deleted: 0,
    unchanged: 0,
  };
  for (const unit of units) counts[documentChangeKind(unit)] += 1;
  return (Object.keys(counts) as DocumentChangeKind[])
    .filter((kind) => counts[kind] > 0)
    .map((kind) => `${counts[kind]} ${documentChangeLabel(kind)}`)
    .join(" · ");
}

function documentChangeLabel(kind: DocumentChangeKind): string {
  return {
    modified: "修改",
    added: "新增",
    deleted: "删除",
    unchanged: "未改动",
  }[kind];
}

function documentDraftRevision(unit: ReviewWorktreeUnit): number {
  return unit.readyDraftHeadRevision ?? unit.draftHeadRevision;
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
  kind: "filter" | "scope",
  value: string,
  label: string,
  current: string
): string {
  return `<button type="button" data-worktree-${kind}="${value}" class="${value === current ? "active" : ""}">${label}</button>`;
}

function scopeLabel(worktree: ReviewWorktree): string {
  return worktree.scope.kind === "user" ? "个人任务" : "团队任务";
}

function statusLabel(status: ReviewWorktree["status"]): string {
  return {
    draft: "正在进行",
    ready: "待确认",
    merging: "正在合入",
    merged: "已合入",
    discarded: "已丢弃",
  }[status];
}

function actionLabel(action: ReviewLifecycleAction): string {
  return {
    ready: "提交确认",
    reopen: "继续修改",
    merge: "合入",
    discard: "丢弃",
  }[action];
}

function modeLabel(mode: ReviewMode): string {
  return { trunk: "正式版本", draft: "AI 修改版", merge: "合入预览" }[mode];
}

function unitTypeLabel(type: number): string {
  return {
    [UniverType.UNIVER_DOC]: "文档",
    [UniverType.UNIVER_SHEET]: "表格",
    [UniverType.UNIVER_SLIDE]: "演示文稿",
    [UniverType.UNIVER_BOARD]: "画板",
    [UniverType.UNIVER_BASE]: "多维表格",
  }[type] ?? `文档类型 ${type}`;
}

function documentVersionLabel(unit: ReviewWorktreeUnit): string {
  const changeKind = documentChangeKind(unit);
  const baseline =
    unit.baselineTrunkRevision === null
      ? "新文档"
      : `正式版本 r${unit.baselineTrunkRevision}`;
  if (changeKind === "deleted") {
    return `${unitTypeLabel(unit.type)} · ${baseline} → 删除`;
  }
  if (changeKind === "unchanged") {
    return `${unitTypeLabel(unit.type)} · ${baseline} · 未改动`;
  }
  return `${unitTypeLabel(unit.type)} · ${baseline} → AI 修改版 r${documentDraftRevision(unit)}`;
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
