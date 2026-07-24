import type { IGetUserResponse } from "@univerjs/protocol";
import {
  LocaleType,
  LogLevel,
  type Univer,
  UserManagerService,
} from "@univerjs/core";
import type { FUniver } from "@univerjs/core/facade";
import { UniverLicensePlugin } from "@univerjs-pro/license";
import CollaborationClientZhCN from "@univerjs-pro/collaboration-client/locale/zh-CN";
import "@univerjs-pro/collaboration-client/facade";
import CollaborationClientUIZhCN from "@univerjs-pro/collaboration-client-ui/locale/zh-CN";
import {
  WorktreeClient,
  WorktreeEventClient,
  type WorktreeEventSubscription,
} from "@univerjs/collaboration-worktree-client";
import type {
  WorktreeData,
  WorktreeStatus,
} from "@univerjs/collaboration-worktree-service";
import { HTTPService } from "@univerjs/network";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import UniverPresetSheetsCoreZhCN from "@univerjs/preset-sheets-core/locales/zh-CN";
import {
  createUniver,
  defaultTheme,
  mergeLocales,
} from "@univerjs/presets";
import { DEMO_TRUNK_UNIT_ID } from "../../shared/demo";
import {
  createWorktree,
  groupWorktrees,
  isProcessedStatus,
  listWorktrees,
  type DemoWorktree,
} from "./api";
import { origin } from "./consts";
import { getCollaborationPlugins } from "./plugins";

import "@univerjs/preset-sheets-core/lib/index.css";
import "../global.css";

type View =
  | { readonly kind: "trunk" }
  | { readonly kind: "worktree"; readonly worktreeID: string };

type LifecycleAction = "ready" | "reopen" | "merge" | "discard";

const elements = {
  trunkRow: requireButton("trunk-row"),
  createButton: requireButton("create-worktree"),
  activeList: requireElement("active-worktrees"),
  processedToggle: requireButton("processed-toggle"),
  processedLabel: requireElement("processed-label"),
  processedList: requireElement("processed-worktrees"),
  topbar: requireElement("topbar"),
  viewerContainer: requireElement("univer-container"),
  viewerOverlay: requireElement("viewer-overlay"),
  viewerOverlayText: requireElement("viewer-overlay-text"),
  createDialog: requireDialog("create-dialog"),
  createForm: requireForm("create-form"),
  createName: requireInput("worktree-name"),
  createError: requireElement("create-error"),
  createSubmit: requireButton("create-submit"),
  createCancel: requireButton("create-cancel"),
  createClose: requireButton("create-close"),
  confirmDialog: requireDialog("confirm-dialog"),
  confirmTitle: requireElement("confirm-title"),
  confirmMessage: requireElement("confirm-message"),
  confirmSubmit: requireButton("confirm-submit"),
  toast: requireElement("toast"),
};

class WorktreeDemoApp {
  private readonly _client = new WorktreeClient({ origin });
  private _worktrees: DemoWorktree[] = [];
  private _view: View = { kind: "trunk" };
  private _processedExpanded = false;
  private _operationBusy = false;
  private _univer: Univer | undefined;
  private _viewerKey = "";
  private _viewerGeneration = 0;
  private _events: WorktreeEventClient | undefined;
  private _eventSubscription: WorktreeEventSubscription | undefined;
  private _toastTimer: ReturnType<typeof setTimeout> | undefined;

  async start(): Promise<void> {
    this._wireStaticActions();
    this._worktrees = [...(await listWorktrees())];
    this._renderSidebar();
    await this._activateFromLocation();
  }

  dispose(): void {
    this._eventSubscription?.dispose();
    this._events?.dispose();
    this._disposeViewer();
    if (this._toastTimer) clearTimeout(this._toastTimer);
  }

  private _wireStaticActions(): void {
    elements.trunkRow.addEventListener("click", () => {
      void this._navigate({ kind: "trunk" });
    });
    elements.createButton.addEventListener("click", () => {
      this._openCreateDialog();
    });
    elements.processedToggle.addEventListener("click", () => {
      this._processedExpanded = !this._processedExpanded;
      this._renderSidebar();
    });
    elements.createCancel.addEventListener("click", () => {
      elements.createDialog.close();
    });
    elements.createClose.addEventListener("click", () => {
      elements.createDialog.close();
    });
    elements.createForm.addEventListener("submit", (event) => {
      void this._submitCreate(event);
    });
    window.addEventListener("popstate", () => {
      void this._activateFromLocation();
    });
    window.addEventListener(
      "beforeunload",
      () => {
        this.dispose();
      },
      { once: true }
    );
  }

  private async _activateFromLocation(): Promise<void> {
    const worktreeID = new URL(window.location.href).searchParams.get(
      "worktree"
    );
    if (!worktreeID) {
      await this._selectView({ kind: "trunk" });
      return;
    }
    const worktree = this._findWorktree(worktreeID);
    if (!worktree || isProcessedStatus(worktree.status)) {
      this._showToast(
        worktree
          ? "该 Worktree 已处理，已返回主线"
          : "该 Worktree 不存在，已返回主线"
      );
      this._writeLocation({ kind: "trunk" }, "replace");
      await this._selectView({ kind: "trunk" });
      return;
    }
    await this._selectView({ kind: "worktree", worktreeID });
  }

  private async _navigate(view: View): Promise<void> {
    if (
      this._view.kind === view.kind &&
      (view.kind === "trunk" ||
        (this._view.kind === "worktree" &&
          this._view.worktreeID === view.worktreeID))
    ) {
      return;
    }
    this._writeLocation(view, "push");
    await this._selectView(view);
  }

  private async _selectView(view: View): Promise<void> {
    this._view = view;
    this._eventSubscription?.dispose();
    this._eventSubscription = undefined;
    this._events?.dispose();
    this._events = undefined;
    this._renderSidebar();
    this._renderTopbar();

    if (view.kind === "worktree") {
      this._connectEvents(view.worktreeID);
    }
    await this._mountViewer();
  }

  private _connectEvents(worktreeID: string): void {
    const events = new WorktreeEventClient({ origin, worktreeID });
    this._events = events;
    this._eventSubscription = events.onChange((worktree) => {
      void this._applyWorktreeUpdate(worktree);
    });
    void events.connect().catch((error: unknown) => {
      if (
        this._view.kind === "worktree" &&
        this._view.worktreeID === worktreeID
      ) {
        this._showToast(errorMessage(error));
      }
    });
  }

  private async _mountViewer(): Promise<void> {
    const worktree =
      this._view.kind === "worktree"
        ? this._findWorktree(this._view.worktreeID)
        : undefined;
    if (this._view.kind === "worktree" && !worktree) {
      await this._returnToTrunk("该 Worktree 不存在");
      return;
    }
    const editable = worktree?.status === "draft";
    const key =
      this._view.kind === "trunk"
        ? "trunk:readonly"
        : `${this._view.worktreeID}:${editable ? "editable" : "readonly"}`;
    if (key === this._viewerKey && this._univer) return;

    const generation = ++this._viewerGeneration;
    this._disposeViewer();
    this._viewerKey = key;
    this._setViewerOverlay("loading", "正在加载表格…");

    try {
      const { univer, univerAPI } = createUniver({
        locale: LocaleType.ZH_CN,
        locales: {
          [LocaleType.ZH_CN]: mergeLocales(
            UniverPresetSheetsCoreZhCN,
            CollaborationClientZhCN,
            CollaborationClientUIZhCN
          ),
        },
        theme: defaultTheme,
        logLevel: LogLevel.WARN,
        collaboration: true,
        presets: [
          UniverSheetsCorePreset({
            container: "univer-container",
          }),
        ],
        plugins: [
          [
            UniverLicensePlugin,
            {
              license:
                import.meta.env.VITE_UNIVER_LICENSE || undefined,
            },
          ],
          ...getCollaborationPlugins(
            this._view.kind === "worktree"
              ? this._view.worktreeID
              : undefined
          ),
        ],
      });
      this._univer = univer;
      await fetchServerUser(univer);
      const workbook = await univerAPI
        .getCollaboration()
        .loadSheetAsync(DEMO_TRUNK_UNIT_ID);
      if (generation !== this._viewerGeneration) {
        univer.dispose();
        return;
      }
      if (!workbook) {
        throw new Error("无法加载示例表格");
      }
      workbook.setEditable(editable);
      this._setViewerOverlay("hidden");
      window.univer = univer;
      window.univerAPI = univerAPI;
    } catch (error) {
      if (generation !== this._viewerGeneration) return;
      this._setViewerOverlay("error", errorMessage(error));
    }
  }

  private _disposeViewer(): void {
    this._univer?.dispose();
    this._univer = undefined;
    this._viewerKey = "";
    elements.viewerContainer.replaceChildren();
    delete window.univer;
    delete window.univerAPI;
  }

  private _renderSidebar(): void {
    const { active, processed } = groupWorktrees(this._worktrees);
    elements.trunkRow.classList.toggle(
      "active",
      this._view.kind === "trunk"
    );
    elements.activeList.replaceChildren(
      ...(active.length
        ? active.map((worktree) => this._activeRow(worktree))
        : [emptyRow("暂无 Worktree")])
    );
    elements.processedLabel.textContent = `已处理 · ${processed.length}`;
    elements.processedToggle.setAttribute(
      "aria-expanded",
      String(this._processedExpanded)
    );
    elements.processedList.hidden = !this._processedExpanded;
    elements.processedList.replaceChildren(
      ...(processed.length
        ? processed.map((worktree) => processedRow(worktree))
        : [emptyRow("暂无已处理项")])
    );
  }

  private _activeRow(worktree: DemoWorktree): HTMLElement {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "nav-row worktree-row";
    row.classList.toggle(
      "active",
      this._view.kind === "worktree" &&
        this._view.worktreeID === worktree.worktreeID
    );
    row.addEventListener("click", () => {
      void this._navigate({
        kind: "worktree",
        worktreeID: worktree.worktreeID,
      });
    });
    row.append(
      textElement("span", "row-icon", worktree.status === "draft" ? "●" : "◇"),
      rowCopy(worktree.name, statusLabel(worktree.status)),
      statusChip(worktree.status)
    );
    return row;
  }

  private _renderTopbar(): void {
    elements.topbar.replaceChildren();
    elements.topbar.classList.toggle(
      "worktree",
      this._view.kind === "worktree"
    );
    if (this._view.kind === "trunk") {
      elements.topbar.append(
        topbarCopy("▦", "主线", "共享正式版本"),
        topbarActions([readonlyChip()])
      );
      document.title = "主线 · Univer Worktree Demo";
      return;
    }

    const worktree = this._findWorktree(this._view.worktreeID);
    if (!worktree) return;
    const actions: HTMLElement[] = [statusChip(worktree.status)];
    if (worktree.status === "draft") {
      actions.push(
        this._actionButton("标记为待合入", "ready", "primary"),
        this._actionButton("丢弃", "discard", "danger")
      );
    } else if (worktree.status === "ready") {
      actions.push(
        this._actionButton("重新编辑", "reopen", "secondary"),
        this._actionButton("合入主线", "merge", "primary"),
        this._actionButton("丢弃", "discard", "danger")
      );
    }
    elements.topbar.append(
      topbarCopy(
        "◇",
        worktree.name,
        worktree.status === "draft" ? "可编辑分支" : "只读分支"
      ),
      topbarActions(actions)
    );
    document.title = `${worktree.name} · Univer Worktree Demo`;
  }

  private _actionButton(
    label: string,
    action: LifecycleAction,
    variant: "primary" | "secondary" | "danger"
  ): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `button ${variant}`;
    button.textContent = label;
    button.disabled = this._operationBusy;
    button.addEventListener("click", () => {
      void this._runLifecycle(action);
    });
    return button;
  }

  private async _runLifecycle(action: LifecycleAction): Promise<void> {
    if (this._operationBusy || this._view.kind !== "worktree") return;
    const worktree = this._findWorktree(this._view.worktreeID);
    if (!worktree) return;

    if (action === "merge") {
      const confirmed = await showConfirmation({
        title: "合入这个 Worktree？",
        message: `「${worktree.name}」中的修改将进入主线。`,
        confirmLabel: "确认合入",
      });
      if (!confirmed) return;
    }
    if (action === "discard") {
      const confirmed = await showConfirmation({
        title: "丢弃这个 Worktree？",
        message: `「${worktree.name}」将被标记为已丢弃，主线不会受到影响。本 demo 不支持恢复。`,
        confirmLabel: "确认丢弃",
        danger: true,
      });
      if (!confirmed) return;
    }

    this._operationBusy = true;
    this._renderTopbar();
    try {
      const updated = await this._executeLifecycle(
        action,
        worktree.worktreeID
      );
      await this._applyWorktreeUpdate(updated);
      if (
        action === "merge" &&
        updated.status === "ready" &&
        updated.units.some(
          ({ mergeResult }) =>
            mergeResult?.status === "conflict" ||
            mergeResult?.status === "failed"
        )
      ) {
        this._showToast("无法自动合入，Worktree 已保留为待合入状态");
      } else {
        this._showToast(lifecycleSuccessMessage(action));
      }
    } catch (error) {
      this._showToast(errorMessage(error));
    } finally {
      this._operationBusy = false;
      this._renderTopbar();
    }
  }

  private _executeLifecycle(
    action: LifecycleAction,
    worktreeID: string
  ): Promise<WorktreeData> {
    switch (action) {
      case "ready":
        return this._client.markReady(worktreeID);
      case "reopen":
        return this._client.reopenWorktree(worktreeID);
      case "merge":
        return this._client.mergeWorktree(worktreeID);
      case "discard":
        return this._client.discardWorktree(worktreeID);
    }
  }

  private async _applyWorktreeUpdate(
    worktree: WorktreeData
  ): Promise<void> {
    const index = this._worktrees.findIndex(
      ({ worktreeID }) => worktreeID === worktree.worktreeID
    );
    if (index < 0) return;
    const previous = this._worktrees[index] as DemoWorktree;
    const completedAt = isProcessedStatus(worktree.status)
      ? previous.completedAt ?? Date.now()
      : previous.completedAt;
    const updated: DemoWorktree = {
      ...previous,
      ...worktree,
      ...(completedAt === undefined ? {} : { completedAt }),
    };
    this._worktrees.splice(index, 1, updated);
    this._renderSidebar();
    this._renderTopbar();

    if (
      isProcessedStatus(updated.status) &&
      this._view.kind === "worktree" &&
      this._view.worktreeID === updated.worktreeID
    ) {
      this._flashProcessed();
      await this._returnToTrunk(
        updated.status === "merged"
          ? "Worktree 已合入主线"
          : "Worktree 已丢弃"
      );
      return;
    }

    if (
      this._view.kind === "worktree" &&
      this._view.worktreeID === updated.worktreeID &&
      (previous.status === "draft") !== (updated.status === "draft")
    ) {
      await this._mountViewer();
    }
  }

  private async _returnToTrunk(message: string): Promise<void> {
    this._showToast(message);
    this._writeLocation({ kind: "trunk" }, "replace");
    await this._selectView({ kind: "trunk" });
  }

  private _openCreateDialog(): void {
    elements.createName.value = `Worktree ${this._worktrees.length + 1}`;
    elements.createError.textContent = "";
    elements.createSubmit.disabled = false;
    elements.createDialog.showModal();
    elements.createName.select();
  }

  private async _submitCreate(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const name = elements.createName.value.trim();
    if (!name) {
      elements.createError.textContent = "请输入 Worktree 名称";
      return;
    }
    elements.createSubmit.disabled = true;
    elements.createError.textContent = "";
    try {
      const worktree = await createWorktree(name);
      this._worktrees.unshift(worktree);
      elements.createDialog.close();
      this._renderSidebar();
      await this._navigate({
        kind: "worktree",
        worktreeID: worktree.worktreeID,
      });
      this._showToast("Worktree 已创建");
    } catch (error) {
      elements.createError.textContent = errorMessage(error);
    } finally {
      elements.createSubmit.disabled = false;
    }
  }

  private _writeLocation(
    view: View,
    mode: "push" | "replace"
  ): void {
    const url = new URL(window.location.href);
    url.searchParams.delete("unit");
    url.searchParams.delete("type");
    if (view.kind === "worktree") {
      url.searchParams.set("worktree", view.worktreeID);
    } else {
      url.searchParams.delete("worktree");
    }
    const method = mode === "push" ? "pushState" : "replaceState";
    window.history[method](null, "", url);
  }

  private _findWorktree(worktreeID: string): DemoWorktree | undefined {
    return this._worktrees.find(
      (worktree) => worktree.worktreeID === worktreeID
    );
  }

  private _setViewerOverlay(
    state: "loading" | "error" | "hidden",
    message = ""
  ): void {
    elements.viewerOverlay.classList.toggle("visible", state !== "hidden");
    elements.viewerOverlay.classList.toggle("error", state === "error");
    elements.viewerOverlayText.textContent = message;
  }

  private _showToast(message: string): void {
    if (this._toastTimer) clearTimeout(this._toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.add("visible");
    this._toastTimer = setTimeout(() => {
      elements.toast.classList.remove("visible");
      this._toastTimer = undefined;
    }, 3_000);
  }

  private _flashProcessed(): void {
    elements.processedToggle.classList.remove("flash");
    requestAnimationFrame(() => {
      elements.processedToggle.classList.add("flash");
      setTimeout(() => {
        elements.processedToggle.classList.remove("flash");
      }, 1_800);
    });
  }
}

function processedRow(worktree: DemoWorktree): HTMLElement {
  const row = document.createElement("div");
  row.className = "processed-row";
  row.append(
    textElement("span", "row-icon", "◇"),
    rowCopy(
      worktree.name,
      `${statusLabel(worktree.status)} · ${relativeTime(
        worktree.completedAt ?? worktree.createdAt
      )}`
    ),
    statusChip(worktree.status)
  );
  return row;
}

function emptyRow(message: string): HTMLElement {
  return textElement("div", "empty-row", message);
}

function rowCopy(title: string, subtitle: string): HTMLElement {
  const copy = document.createElement("span");
  copy.className = "row-copy";
  copy.append(
    textElement("strong", "", title),
    textElement("small", "", subtitle)
  );
  return copy;
}

function topbarCopy(
  icon: string,
  title: string,
  subtitle: string
): HTMLElement {
  const copy = document.createElement("div");
  copy.className = "topbar-copy";
  const titleElement = document.createElement("div");
  titleElement.className = "topbar-title";
  titleElement.append(
    textElement("strong", "", title),
    textElement("small", "", subtitle)
  );
  copy.append(textElement("span", "row-icon", icon), titleElement);
  return copy;
}

function topbarActions(items: readonly HTMLElement[]): HTMLElement {
  const actions = document.createElement("div");
  actions.className = "topbar-actions";
  actions.append(...items);
  return actions;
}

function readonlyChip(): HTMLElement {
  const chip = document.createElement("span");
  chip.className = "status status-merged";
  chip.textContent = "只读";
  return chip;
}

function statusChip(status: WorktreeStatus): HTMLElement {
  const chip = document.createElement("span");
  chip.className = `status status-${status}`;
  chip.textContent = statusLabel(status);
  return chip;
}

function statusLabel(status: WorktreeStatus): string {
  switch (status) {
    case "draft":
      return "编辑中";
    case "ready":
      return "待合入";
    case "merging":
      return "合入中";
    case "merged":
      return "已合入";
    case "discarded":
      return "已丢弃";
  }
}

function lifecycleSuccessMessage(action: LifecycleAction): string {
  switch (action) {
    case "ready":
      return "Worktree 已标记为待合入";
    case "reopen":
      return "Worktree 已重新开放编辑";
    case "merge":
      return "Worktree 已合入主线";
    case "discard":
      return "Worktree 已丢弃";
  }
}

function relativeTime(timestamp: number): string {
  const elapsed = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

async function showConfirmation(options: {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel: string;
  readonly danger?: boolean;
}): Promise<boolean> {
  elements.confirmTitle.textContent = options.title;
  elements.confirmMessage.textContent = options.message;
  elements.confirmSubmit.textContent = options.confirmLabel;
  elements.confirmSubmit.className = `button ${
    options.danger ? "danger" : "primary"
  }`;
  elements.confirmDialog.returnValue = "";
  elements.confirmDialog.showModal();
  return new Promise((resolve) => {
    elements.confirmDialog.addEventListener(
      "close",
      () => resolve(elements.confirmDialog.returnValue === "confirm"),
      { once: true }
    );
  });
}

async function fetchServerUser(univer: Univer): Promise<void> {
  const injector = univer.__getInjector();
  const userService = injector.get(UserManagerService);
  const httpService = injector.get(HTTPService);
  const response = await httpService.get<IGetUserResponse>(
    `${origin}/universer-api/user`
  );
  if (response.body.user) userService.setCurrentUser(response.body.user);
}

function textElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text: string
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text;
  return element;
}

function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element;
}

function requireButton(id: string): HTMLButtonElement {
  const element = requireElement(id);
  if (!(element instanceof HTMLButtonElement)) {
    throw new Error(`#${id} must be a button`);
  }
  return element;
}

function requireDialog(id: string): HTMLDialogElement {
  const element = requireElement(id);
  if (!(element instanceof HTMLDialogElement)) {
    throw new Error(`#${id} must be a dialog`);
  }
  return element;
}

function requireForm(id: string): HTMLFormElement {
  const element = requireElement(id);
  if (!(element instanceof HTMLFormElement)) {
    throw new Error(`#${id} must be a form`);
  }
  return element;
}

function requireInput(id: string): HTMLInputElement {
  const element = requireElement(id);
  if (!(element instanceof HTMLInputElement)) {
    throw new Error(`#${id} must be an input`);
  }
  return element;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "发生了未知错误";
}

const app = new WorktreeDemoApp();
void app.start().catch((error: unknown) => {
  elements.viewerOverlay.classList.add("visible", "error");
  elements.viewerOverlayText.textContent = errorMessage(error);
});

declare global {
  interface Window {
    univer?: Univer;
    univerAPI?: FUniver;
  }
}
