import { UniverInstanceType } from "@univerjs/core";
import type { SaveSnapshotInput } from "@univerjs/collaboration-service";
import { PRESET_USERS } from "../shared/preset-users.js";
import {
  resolveEditorAccess,
  type EditorAccessResult,
} from "./editor-access.js";
import {
  worktreeReviewView,
  type ReviewMode,
  type ReviewWorktree,
  type ReviewWorktreeFilter,
  type ReviewWorktreeScope,
} from "./worktrees/review.js";
import {
  configureReviewCollaboration,
} from "./collaboration.js";
import "./styles.css";

type WorkspaceView =
  | "home"
  | "recent"
  | "space"
  | "shared"
  | "trash"
  | "worktrees";

const url = new URL(window.location.href);
const unitID = url.searchParams.get("unit");
const resourceID = url.searchParams.get("resource");
const reviewWorktreeID = url.searchParams.get("reviewWorktree");
const type = Number(url.searchParams.get("type"));

void start();

async function start(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) {
    renderAuth("login");
    return;
  }

  if (
    reviewWorktreeID &&
    unitID &&
    [
      UniverInstanceType.UNIVER_SHEET,
      UniverInstanceType.UNIVER_DOC,
      UniverInstanceType.UNIVER_SLIDE,
    ].includes(type)
  ) {
    await renderWorktreeReviewEditor(reviewWorktreeID, unitID, type);
    return;
  }
  if (
    unitID &&
    [
      UniverInstanceType.UNIVER_SHEET,
      UniverInstanceType.UNIVER_DOC,
      UniverInstanceType.UNIVER_SLIDE,
    ].includes(type)
  ) {
    await renderEditor(unitID, type);
    return;
  }
  await renderWorkspace(user);
}

async function renderWorktreeReviewEditor(
  worktreeID: string,
  reviewUnitID: string,
  reviewType: UniverInstanceType
): Promise<void> {
  const result = await api<{ worktree: ReviewWorktree }>(
    `/api/worktrees/${encodeURIComponent(worktreeID)}`
  );
  const worktree = result.worktree;
  const unit = worktree.units.find(
    (candidate) =>
      candidate.unitID === reviewUnitID &&
      candidate.type === reviewType
  );
  if (!unit) {
    renderEditorError("unavailable");
    return;
  }
  const requestedMode = url.searchParams.get("reviewMode");
  const mode: ReviewMode =
    requestedMode === "trunk" ||
    requestedMode === "merge" ||
    requestedMode === "draft"
      ? requestedMode
      : "draft";
  if (mode === "trunk" && unit.source !== "trunk") {
    renderReviewUnavailable("Agent 新建的 Unit 没有主线版本。");
    return;
  }
  if (mode === "merge") {
    const preview = await api<{
      evaluation: {
        readonly status: string;
        readonly preview?: SaveSnapshotInput;
      };
    }>(
      `/universer-api/worktrees/${encodeURIComponent(worktreeID)}/units/${encodeURIComponent(reviewUnitID)}/merge-preview`
    );
    if (
      preview.evaluation.status !== "preview" ||
      preview.evaluation.preview === undefined
    ) {
      renderReviewUnavailable(
        preview.evaluation.status === "conflict"
          ? "当前变更存在合并冲突，无法生成合入预览。"
          : "当前状态没有可用的合入预览。"
      );
      return;
    }
    configureReviewCollaboration({
      kind: "merge",
      worktreeID,
      preview: preview.evaluation.preview,
    });
  } else if (mode === "draft") {
    configureReviewCollaboration({ kind: "worktree", worktreeID });
  } else {
    configureReviewCollaboration({ kind: "trunk" });
  }

  const app = requireApp();
  document.documentElement.dataset.accessRole = "viewer";
  document.documentElement.dataset.reviewReadonly = "true";
  app.innerHTML = `
    <div class="editor-shell review-editor-shell">
      <header class="editor-header">
        <a class="editor-brand" href="/#worktrees" target="_top">
          ${logoIcon()}
          <span>Univer</span>
        </a>
        <span class="editor-divider"></span>
        <span id="editor-title">${escapeHtml(unit.name)}</span>
        <span class="editor-status">只读 · ${reviewModeName(mode)}</span>
        <span class="editor-owner">${escapeHtml(worktree.name)}</span>
      </header>
      <main id="univer-container"></main>
    </div>
  `;
  switch (reviewType) {
    case UniverInstanceType.UNIVER_SHEET:
      await import("./units/sheet.js");
      return;
    case UniverInstanceType.UNIVER_DOC:
      await import("./units/doc.js");
      return;
    case UniverInstanceType.UNIVER_SLIDE:
      await import("./units/slide.js");
  }
}

function renderReviewUnavailable(message: string): void {
  requireApp().innerHTML = `
    <main class="editor-route-state editor-route-error">
      <h1>预览不可用</h1>
      <p>${escapeHtml(message)}</p>
      <a class="primary-button editor-route-action" href="/#worktrees" target="_top">返回智能工作台</a>
    </main>
  `;
}

function reviewModeName(mode: ReviewMode): string {
  return { trunk: "正式版本", draft: "AI 修改版", merge: "合入预览" }[mode];
}

function renderAuth(mode: "login" | "register"): void {
  const isRegister = mode === "register";
  const app = requireApp();
  app.innerHTML = `
    <main class="auth-page">
      <a class="auth-brand" href="/" aria-label="Univer Workspace 首页">
        ${logoIcon()}
        <span>Univer Workspace</span>
      </a>
      <div class="auth-orb auth-orb-one"></div>
      <div class="auth-orb auth-orb-two"></div>
      <section class="auth-card" aria-labelledby="auth-title">
        <header>
          <h1 id="auth-title">${isRegister ? "创建账号" : "欢迎回来"}</h1>
          <p>${isRegister ? "创建你的个人协作空间" : "登录并继续你的协作工作"}</p>
        </header>
        <form id="auth-form">
          <label>
            <span>用户名</span>
            <input
              name="username"
              autocomplete="username"
              minlength="3"
              maxlength="32"
              placeholder="${isRegister ? "设置登录用户名" : "输入用户名"}"
              required
              autofocus
            />
          </label>
          <label>
            <span>密码</span>
            <input
              name="password"
              type="password"
              autocomplete="${isRegister ? "new-password" : "current-password"}"
              minlength="8"
              maxlength="128"
              placeholder="${isRegister ? "至少 8 个字符" : "输入密码"}"
              required
            />
          </label>
          ${
            isRegister
              ? `<label>
                  <span>确认密码</span>
                  <input
                    name="confirmPassword"
                    type="password"
                    autocomplete="new-password"
                    minlength="8"
                    maxlength="128"
                    placeholder="再次输入密码"
                    required
                  />
                </label>`
              : ""
          }
          <p id="auth-error" class="form-error" role="alert" hidden></p>
          <button class="primary-button auth-submit" type="submit">
            ${isRegister ? "注册" : "登录"}
          </button>
        </form>
        ${
          isRegister
            ? ""
            : `<div class="preset-login">
                <span>示例账号</span>
                <div>
                  ${PRESET_USERS.map(
                    ({ username, name }) => `
                      <button type="button" data-preset-login="${username}">
                        <i>${escapeHtml(initials(name))}</i>
                        <span><strong>${escapeHtml(name)}</strong><small>@${username}</small></span>
                        ${icon("arrow")}
                      </button>`
                  ).join("")}
                </div>
              </div>`
        }
        <p class="auth-switch">
          ${isRegister ? "已有账号？" : "还没有账号？"}
          <button id="auth-switch" type="button">
            ${isRegister ? "返回登录" : "创建账号"}
          </button>
        </p>
        <footer>本地示例 · 数据仅保存在当前服务</footer>
      </section>
    </main>
  `;

  document.querySelector("#auth-switch")?.addEventListener("click", () => {
    renderAuth(isRegister ? "login" : "register");
  });
  document
    .querySelectorAll<HTMLButtonElement>("[data-preset-login]")
    .forEach((button) => {
      button.addEventListener("click", async () => {
        const username = button.dataset.presetLogin!;
        const preset = PRESET_USERS.find((item) => item.username === username);
        if (!preset) return;
        const error = document.querySelector<HTMLElement>("#auth-error");
        button.disabled = true;
        try {
          await api("/api/auth/login", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              username: preset.username,
              password: preset.password,
            }),
          });
          window.location.href = "/";
        } catch (caught) {
          showInlineError(
            error,
            caught instanceof Error ? caught.message : String(caught)
          );
          button.disabled = false;
        }
      });
    });
  document
    .querySelector<HTMLFormElement>("#auth-form")
    ?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget as HTMLFormElement;
      const data = new FormData(form);
      const username = String(data.get("username") ?? "");
      const password = String(data.get("password") ?? "");
      const confirmPassword = String(data.get("confirmPassword") ?? "");
      const error = document.querySelector<HTMLElement>("#auth-error");
      if (isRegister && password !== confirmPassword) {
        showInlineError(error, "两次输入的密码不一致");
        return;
      }
      const submit = form.querySelector<HTMLButtonElement>("[type=submit]");
      if (submit) submit.disabled = true;
      try {
        await api(`/api/auth/${isRegister ? "register" : "login"}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ username, password }),
        });
        window.location.href = "/";
      } catch (caught) {
        showInlineError(
          error,
          caught instanceof Error ? caught.message : String(caught)
        );
      } finally {
        if (submit) submit.disabled = false;
      }
    });
}

async function renderEditor(
  editorUnitID: string,
  editorType: UniverInstanceType
): Promise<void> {
  renderEditorLoading();
  const access = await resolveEditorAccess({
    resourceID,
    unitID: editorUnitID,
    type: editorType,
  });
  if (access.status !== "allowed") {
    renderEditorError(access.status);
    return;
  }

  const app = requireApp();
  document.documentElement.dataset.accessRole = access.resource.accessRole;
  const isPersonalOwner =
    access.resource.space.type === "personal" &&
    access.resource.accessRole === "owner";
  const canManageTeam =
    access.resource.space.type === "team" &&
    ["owner", "admin"].includes(access.resource.accessRole);
  const canRename = access.resource.accessRole !== "viewer";
  app.innerHTML = `
    <div class="editor-shell">
      <header class="editor-header">
        <a class="editor-brand" href="/">
          ${logoIcon()}
          <span>Univer</span>
        </a>
        <span class="editor-divider"></span>
        ${
          canRename
            ? `<button id="editor-title" class="editor-title-button" type="button" title="重命名">
                <span>${escapeHtml(access.resource.name)}</span>${icon("edit")}
              </button>`
            : `<span id="editor-title">${escapeHtml(access.resource.name)}</span>`
        }
        <span class="editor-status">${accessRoleName(access.resource.accessRole)}</span>
        ${
          isPersonalOwner
            ? `<button id="share-button" class="editor-share-button" type="button">
                ${icon("share")}分享
              </button>`
            : canManageTeam
              ? `<button id="team-members-button" class="editor-share-button" type="button">
                  ${icon("users")}团队成员
                </button>`
              : `<span class="editor-owner">${escapeHtml(access.resource.space.name)}</span>`
        }
      </header>
      <main id="univer-container"></main>
    </div>
  `;
  document.querySelector("#share-button")?.addEventListener("click", () => {
    void openShareDialog(access.resource);
  });
  document
    .querySelector("#team-members-button")
    ?.addEventListener("click", () => {
      void openTeamMembersDialog({
        ...access.resource.space,
        accessRole: access.resource.accessRole,
      });
    });
  document.querySelector("#editor-title")?.addEventListener("click", () => {
    if (!canRename) return;
    openRenameDialog(access.resource, (renamed) => {
      const title = document.querySelector<HTMLElement>("#editor-title span");
      if (title) title.textContent = renamed.name;
      document.title = `${renamed.name} · Univer`;
    });
  });

  switch (editorType) {
    case UniverInstanceType.UNIVER_SHEET:
      await import("./units/sheet.js");
      return;
    case UniverInstanceType.UNIVER_DOC:
      await import("./units/doc.js");
      return;
    case UniverInstanceType.UNIVER_SLIDE:
      await import("./units/slide.js");
  }
}

function renderEditorLoading(): void {
  requireApp().innerHTML = `
    <div class="editor-route-shell">
      <header class="editor-header">
        <a class="editor-brand" href="/">
          ${logoIcon()}
          <span>Univer</span>
        </a>
      </header>
      <main class="editor-route-state" aria-live="polite">
        <span class="editor-route-spinner" aria-hidden="true"></span>
        <p>正在验证文件访问权限…</p>
      </main>
    </div>
  `;
}

function renderEditorError(
  status: Exclude<EditorAccessResult["status"], "allowed">
): void {
  const unauthenticated = status === "unauthenticated";
  const serviceError = status === "service-error";
  const title = unauthenticated
    ? "登录状态已失效"
    : serviceError
      ? "暂时无法打开文件"
      : "无法打开此文件";
  const description = unauthenticated
    ? "请重新登录后再试。"
    : serviceError
      ? "服务暂时不可用，请稍后重试。"
      : status === "invalid-link"
        ? "文件链接无效或不完整。"
        : "文件不存在，或你没有访问权限。";

  requireApp().innerHTML = `
    <div class="editor-route-shell">
      <header class="editor-header">
        <a class="editor-brand" href="/">
          ${logoIcon()}
          <span>Univer</span>
        </a>
      </header>
      <main class="editor-route-state editor-route-error">
        <span class="editor-route-error-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M7 10V8a5 5 0 0 1 10 0v2"/>
            <rect x="5" y="10" width="14" height="11" rx="2"/>
            <path d="M12 14v3"/>
          </svg>
        </span>
        <h1>${title}</h1>
        <p>${description}</p>
        <a class="primary-button editor-route-action" href="/">
          ${unauthenticated ? "重新登录" : "返回首页"}
        </a>
      </main>
    </div>
  `;
}

async function renderWorkspace(user: CurrentUser): Promise<void> {
  const app = requireApp();
  let spaces = (
    await api<{ spaces: SpaceRecord[] }>("/api/spaces")
  ).spaces;
  const foundPersonalSpace = spaces.find(({ type }) => type === "personal");
  if (!foundPersonalSpace) throw new Error("个人空间不存在");
  const personalSpace: SpaceRecord = foundPersonalSpace;

  let resources: ResourceRecord[] = [];
  let nodes: DirectoryNode[] = [];
  let worktrees: ReviewWorktree[] = [];
  let directory: DirectoryPayload | null = null;
  let route = workspaceRoute(personalSpace.id);
  let query = "";
  let worktreeFilter: ReviewWorktreeFilter = "all";
  let worktreeScope: ReviewWorktreeScope = "all";
  let worktreeSpaceID = "";
  let selectedWorktreeID = "";
  let selectedWorktreeUnitID = "";
  let reviewMode: ReviewMode = "draft";

  function renderShell(): void {
    const teamSpaces = spaces.filter(({ type }) => type === "team");
    app.innerHTML = `
      <div class="workspace-shell">
        <header class="topbar">
          <a class="topbar-brand" href="#home">
            ${logoIcon()}
            <span>Univer</span>
          </a>
          <label class="global-search">
            ${icon("search")}
            <input type="search" placeholder="搜索当前页面" aria-label="搜索当前页面" />
            <kbd>⌘ K</kbd>
          </label>
          <div class="account">
            <button class="icon-button" type="button" aria-label="帮助">${icon("help")}</button>
            <button class="avatar-button" type="button" aria-label="账号菜单">
              ${escapeHtml(initials(user.name))}
            </button>
            <div class="account-menu" hidden>
              <strong>${escapeHtml(user.name)}</strong>
              <small>@${escapeHtml(user.username)}</small>
              <button id="logout-button" type="button">${icon("logout")}退出登录</button>
            </div>
          </div>
        </header>
        <aside class="sidebar">
          <div class="new-area">
            <button id="new-button" class="new-button" type="button">
              ${icon("plus")}<span>新建</span>${icon("chevron")}
            </button>
            <div id="new-menu" class="new-menu" hidden>
              <button type="button" data-create-folder>
                <span class="menu-icon folder-menu-icon">${icon("folder")}</span>新建文件夹
              </button>
              <span class="new-menu-divider"></span>
              ${createMenuItem(UniverInstanceType.UNIVER_SHEET, "空白表格", "sheet")}
              ${createMenuItem(UniverInstanceType.UNIVER_DOC, "空白文档", "doc")}
              ${createMenuItem(UniverInstanceType.UNIVER_SLIDE, "空白幻灯片", "slide")}
            </div>
          </div>
          <nav class="main-nav" aria-label="主要导航">
            ${navButton("home", "首页", "home")}
            ${navButton("recent", "最近使用", "clock")}
            <a href="#space/${personalSpace.id}" data-space="${personalSpace.id}">
              ${icon("folder")}<span>个人空间</span>
            </a>
            ${navButton("shared", "与我共享", "share")}
            ${navButton("worktrees", "智能工作台", "sparkles")}
            ${navButton("trash", "回收站", "trash")}
          </nav>
          <div class="team-nav">
            <div class="team-nav-heading">
              <span>团队空间</span>
              <button id="create-team-button" type="button" aria-label="创建团队空间">${icon("plus")}</button>
            </div>
            <nav aria-label="团队空间">
              ${
                teamSpaces.length
                  ? teamSpaces
                      .map(
                        (space) => `
                          <a href="#space/${space.id}" data-space="${space.id}">
                            <i>${escapeHtml(initials(space.name))}</i>
                            <span>${escapeHtml(space.name)}</span>
                          </a>`
                      )
                      .join("")
                  : `<p>还没有团队空间</p>`
              }
            </nav>
          </div>
          <div class="sidebar-footer">
            <span>${icon("sparkles")}</span>
            <p><strong>协同已启用</strong><small>个人与团队目录</small></p>
          </div>
        </aside>
        <main id="workspace-content" class="workspace-content" tabindex="-1"></main>
      </div>
    `;

    const accountButton =
      document.querySelector<HTMLButtonElement>(".avatar-button");
    const accountMenu = document.querySelector<HTMLElement>(".account-menu");
    accountButton?.addEventListener("click", () => {
      if (accountMenu) accountMenu.hidden = !accountMenu.hidden;
    });
    document
      .querySelector("#logout-button")
      ?.addEventListener("click", async () => {
        await api("/api/auth/logout", { method: "POST" });
        window.location.href = "/";
      });

    const newButton = document.querySelector<HTMLButtonElement>("#new-button");
    const newMenu = document.querySelector<HTMLElement>("#new-menu");
    newButton?.addEventListener("click", () => {
      if (newMenu) newMenu.hidden = !newMenu.hidden;
    });
    document
      .querySelectorAll<HTMLButtonElement>("[data-create]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          if (newMenu) newMenu.hidden = true;
          void createResource(Number(button.dataset.create), button);
        });
      });
    document
      .querySelector<HTMLButtonElement>("[data-create-folder]")
      ?.addEventListener("click", () => {
        if (newMenu) newMenu.hidden = true;
        const target = createTarget();
        openCreateFolderDialog(target, (folder) => {
          window.location.hash = `space/${encodeURIComponent(
            target.spaceID
          )}/${encodeURIComponent(folder.id)}`;
        });
      });
    document
      .querySelector("#create-team-button")
      ?.addEventListener("click", () => {
        openCreateTeamDialog(async (space) => {
          spaces = (
            await api<{ spaces: SpaceRecord[] }>("/api/spaces")
          ).spaces;
          renderShell();
          window.location.hash = `space/${space.id}`;
        });
      });

    const search =
      document.querySelector<HTMLInputElement>(".global-search input");
    search?.addEventListener("input", () => {
      query = search.value.trim().toLocaleLowerCase();
      renderCurrentView();
    });
  }

  async function loadAndRender(): Promise<void> {
    const currentRoute = workspaceRoute(personalSpace.id);
    route = currentRoute;
    directory = null;
    nodes = [];
    resources = [];
    worktrees = [];
    if (currentRoute.view === "home" || currentRoute.view === "recent") {
      const result = await api<{ resources: ResourceRecord[] }>(
        "/api/units?scope=recent"
      );
      resources = result.resources;
      renderCurrentView();
      return;
    }
    if (currentRoute.view === "shared") {
      const result = await api<{ resources: ResourceRecord[] }>(
        "/api/units?scope=shared"
      );
      resources = result.resources;
      renderCurrentView();
      return;
    }
    if (currentRoute.view === "trash") {
      const manageable = spaces.filter(
        (space) =>
          space.accessRole === "owner" ||
          (space.type === "team" && space.accessRole === "admin")
      );
      const trash = await Promise.all(
        manageable.map(async (space) => {
          const result = await api<{ nodes: DirectoryNode[] }>(
            `/api/spaces/${encodeURIComponent(space.id)}/trash`
          );
          return result.nodes.map((node) => ({ ...node, space }));
        })
      );
      nodes = trash.flat();
      renderCurrentView();
      return;
    }
    if (currentRoute.view === "worktrees") {
      await loadWorktrees();
      return;
    }
    if (currentRoute.view !== "space") return;
    directory = await api<DirectoryPayload>(
      `/api/spaces/${encodeURIComponent(currentRoute.spaceID)}/nodes${
        currentRoute.folderID
          ? `?parentID=${encodeURIComponent(currentRoute.folderID)}`
          : ""
      }`
    );
    nodes = directory.nodes.map((node) => ({
      ...node,
      space: directory!.space,
    }));
    renderCurrentView();
  }

  function renderCurrentView(): void {
    const currentRoute = route;
    document.querySelectorAll<HTMLElement>("[data-view]").forEach((item) => {
      item.classList.toggle("active", item.dataset.view === currentRoute.view);
    });
    document.querySelectorAll<HTMLElement>("[data-space]").forEach((item) => {
      item.classList.toggle(
        "active",
        currentRoute.view === "space" &&
          item.dataset.space === currentRoute.spaceID
      );
    });
    const filteredResources = resources.filter((resource) =>
      resource.name.toLocaleLowerCase().includes(query)
    );
    const filteredNodes = nodes.filter((node) =>
      node.name.toLocaleLowerCase().includes(query)
    );
    const filteredWorktrees = worktrees.filter(
      (worktree) =>
        worktree.name.toLocaleLowerCase().includes(query) ||
        worktree.creatorName.toLocaleLowerCase().includes(query) ||
        worktree.units.some((unit) =>
          unit.name.toLocaleLowerCase().includes(query)
        )
    );
    const content = document.querySelector<HTMLElement>("#workspace-content");
    if (!content) return;
    const isWorktreeView = currentRoute.view === "worktrees";
    content.classList.toggle("workspace-content-worktrees", isWorktreeView);
    document.body.classList.remove("review-preview-open");
    if (currentRoute.view === "home") {
      content.innerHTML = homeView(user, filteredResources);
    } else if (currentRoute.view === "space" && directory) {
      content.innerHTML = directoryView(directory, filteredNodes, query);
    } else if (currentRoute.view === "trash") {
      content.innerHTML = trashView(filteredNodes, query);
    } else if (currentRoute.view === "worktrees") {
      content.innerHTML = worktreeReviewView({
        worktrees: filteredWorktrees,
        ...(selectedWorktreeID ? { selectedWorktreeID } : {}),
        ...(selectedWorktreeUnitID
          ? { selectedUnitID: selectedWorktreeUnitID }
          : {}),
        mode: reviewMode,
        filter: worktreeFilter,
        scope: worktreeScope,
        ...(worktreeSpaceID ? { spaceID: worktreeSpaceID } : {}),
        spaces,
      });
    } else if (
      currentRoute.view === "recent" ||
      currentRoute.view === "shared"
    ) {
      content.innerHTML = listView(
        currentRoute.view,
        filteredResources,
        query
      );
    } else {
      return;
    }
    const currentSpace =
      currentRoute.view === "space"
        ? spaces.find(({ id }) => id === currentRoute.spaceID)
        : personalSpace;
    const newButton = document.querySelector<HTMLButtonElement>("#new-button");
    if (newButton) {
      newButton.disabled =
        currentRoute.view === "worktrees" ||
        currentSpace?.accessRole === "viewer";
    }
    wireContentActions();
  }

  function wireContentActions(): void {
    document
      .querySelectorAll<HTMLButtonElement>("[data-worktree-filter]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          worktreeFilter = button.dataset
            .worktreeFilter as ReviewWorktreeFilter;
          selectFirstVisibleWorktree();
          renderCurrentView();
        });
      });
    document
      .querySelectorAll<HTMLButtonElement>("[data-worktree-scope]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          worktreeScope = button.dataset
            .worktreeScope as ReviewWorktreeScope;
          if (worktreeScope !== "space") worktreeSpaceID = "";
          selectedWorktreeID = "";
          selectedWorktreeUnitID = "";
          void loadWorktrees();
        });
      });
    document
      .querySelector<HTMLSelectElement>("[data-worktree-space]")
      ?.addEventListener("change", (event) => {
        worktreeSpaceID = (event.currentTarget as HTMLSelectElement).value;
        selectedWorktreeID = "";
        selectedWorktreeUnitID = "";
        void loadWorktrees();
      });
    document
      .querySelectorAll<HTMLButtonElement>("[data-worktree-unit]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          selectedWorktreeID = button.dataset.worktreeId ?? "";
          selectedWorktreeUnitID = button.dataset.worktreeUnit ?? "";
          reviewMode = "draft";
          renderCurrentView();
        });
      });
    document
      .querySelector<HTMLButtonElement>("[data-task-panel-toggle]")
      ?.addEventListener("click", (event) => {
        const button = event.currentTarget as HTMLButtonElement;
        const layout = button
          .closest<HTMLElement>(".worktree-review-page")
          ?.querySelector<HTMLElement>(".worktree-review-layout");
        if (!layout) return;
        const collapsed = layout.classList.toggle("task-panel-collapsed");
        const expanded = !collapsed;
        button.setAttribute("aria-expanded", String(expanded));
        const icon = button.querySelector<HTMLElement>("span");
        const label = button.querySelector<HTMLElement>("b");
        if (icon) icon.textContent = expanded ? "‹" : "›";
        if (label) label.textContent = expanded ? "收起任务列表" : "展开任务列表";
      });
    document
      .querySelectorAll<HTMLButtonElement>("[data-review-mode]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          reviewMode = button.dataset.reviewMode as ReviewMode;
          renderCurrentView();
        });
      });
    document
      .querySelector<HTMLButtonElement>("[data-review-expand]")
      ?.addEventListener("click", (event) => {
        const button = event.currentTarget as HTMLButtonElement;
        const preview = button.closest<HTMLElement>(".worktree-unit-preview");
        if (!preview) return;
        setReviewPreviewExpanded(
          preview,
          button,
          !preview.classList.contains("review-preview-expanded")
        );
      });
    document
      .querySelectorAll<HTMLButtonElement>("[data-worktree-action]")
      .forEach((button) => {
        button.addEventListener("click", async () => {
          const action = button.dataset.worktreeAction;
          const worktreeID = button.dataset.worktreeId;
          if (!action || !worktreeID) return;
          if (
            (action === "merge" || action === "discard") &&
            !window.confirm(
              action === "merge"
                ? "确认合入这个文档任务？已成功合入的文档不会回滚。"
                : "确认丢弃这个文档任务？"
            )
          ) {
            return;
          }
          button.disabled = true;
          try {
            await api(
              `/api/worktrees/${encodeURIComponent(worktreeID)}/${action}`,
              { method: "POST" }
            );
            selectedWorktreeID = "";
            selectedWorktreeUnitID = "";
            await loadWorktrees();
          } catch (caught) {
            showToast(
              caught instanceof Error ? caught.message : String(caught)
            );
            button.disabled = false;
          }
        });
      });
    document
      .querySelectorAll<HTMLButtonElement>("[data-quick-create]")
      .forEach((button) => {
        button.addEventListener("click", () =>
          void createResource(
            Number(button.dataset.quickCreate),
            button,
            { spaceID: personalSpace.id, parentID: null }
          )
        );
      });
    document.querySelectorAll<HTMLElement>("[data-open]").forEach((item) => {
      item.addEventListener("click", (event) => {
        if ((event.target as HTMLElement).closest("[data-resource-action]")) {
          return;
        }
        const resource =
          resources.find(({ id }) => id === item.dataset.open) ??
          nodes.find(
            (node): node is ResourceRecord =>
              node.kind === "unit" && node.id === item.dataset.open
          );
        if (resource) openResource(resource);
      });
      item.addEventListener("keydown", (event) => {
        if (event.key === "Enter") item.click();
      });
      });
    document.querySelectorAll<HTMLElement>("[data-folder]").forEach((item) => {
      item.addEventListener("click", (event) => {
        if ((event.target as HTMLElement).closest("[data-resource-action]")) {
          return;
        }
        const folder = nodes.find(
          (node) =>
            node.kind === "folder" && node.id === item.dataset.folder
        );
        if (folder) {
          window.location.hash = `space/${folder.spaceID}/${folder.id}`;
        }
      });
      item.addEventListener("keydown", (event) => {
        if (event.key === "Enter") item.click();
      });
    });
    document
      .querySelectorAll<HTMLButtonElement>("[data-rename]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          const resource =
            resources.find(({ id }) => id === button.dataset.rename) ??
            nodes.find(
              (node): node is ResourceRecord =>
                node.kind === "unit" && node.id === button.dataset.rename
            );
          if (!resource) return;
          openRenameDialog(resource, (renamed) => {
            resources = resources.map((item) =>
              item.id === renamed.id ? renamed : item
            );
            renderCurrentView();
          });
        });
      });
    document
      .querySelectorAll<HTMLButtonElement>("[data-rename-folder]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          const folder = nodes.find(
            (node) =>
              node.kind === "folder" &&
              node.id === button.dataset.renameFolder
          );
          if (!folder || folder.kind !== "folder") return;
          openRenameFolderDialog(folder, () => void loadAndRender());
        });
      });
    document
      .querySelectorAll<HTMLButtonElement>("[data-delete-node]")
      .forEach((button) => {
        button.addEventListener("click", async () => {
          button.disabled = true;
          await api(`/api/nodes/${encodeURIComponent(button.dataset.deleteNode!)}`, {
            method: "DELETE",
          });
          await loadAndRender();
        });
      });
    document
      .querySelectorAll<HTMLButtonElement>("[data-restore-node]")
      .forEach((button) => {
        button.addEventListener("click", async () => {
          button.disabled = true;
          await api(
            `/api/nodes/${encodeURIComponent(button.dataset.restoreNode!)}/restore`,
            { method: "POST" }
          );
          await loadAndRender();
        });
      });
    document
      .querySelector("#manage-team-members")
      ?.addEventListener("click", () => {
        if (directory?.space.type === "team") {
          void openTeamMembersDialog(directory.space);
        }
      });
  }

  async function loadWorktrees(): Promise<void> {
    const query = new URLSearchParams();
    if (worktreeScope !== "all") query.set("scope", worktreeScope);
    if (worktreeSpaceID) query.set("spaceID", worktreeSpaceID);
    const activeQuery = new URLSearchParams(query);
    activeQuery.set("view", "active");
    const processedQuery = new URLSearchParams(query);
    processedQuery.set("view", "processed");
    const [active, processed] = await Promise.all([
      api<{ worktrees: ReviewWorktree[] }>(`/api/worktrees?${activeQuery}`),
      api<{ worktrees: ReviewWorktree[] }>(`/api/worktrees?${processedQuery}`),
    ]);
    worktrees = [...active.worktrees, ...processed.worktrees];
    if (
      !selectedWorktreeID ||
      !worktrees.some(
        (worktree) =>
          worktree.worktreeID === selectedWorktreeID &&
          worktreeMatchesFilter(worktree, worktreeFilter)
      )
    ) {
      selectFirstVisibleWorktree();
    }
    renderCurrentView();
  }

  function selectFirstVisibleWorktree(): void {
    const first = worktrees.find((worktree) =>
      worktreeFilter === "all"
        ? worktree.status === "draft" ||
          worktree.status === "ready" ||
          worktree.status === "merging"
        : worktreeMatchesFilter(worktree, worktreeFilter)
    );
    selectedWorktreeID = first?.worktreeID ?? "";
    selectedWorktreeUnitID = first?.units[0]?.unitID ?? "";
    reviewMode = "draft";
  }

  async function createResource(
    createType: number,
    button: HTMLButtonElement,
    explicitTarget?: CreateTarget
  ): Promise<void> {
    button.disabled = true;
    try {
      const target = explicitTarget ?? createTarget();
      const result = await api<{ resource: ResourceRecord }>("/api/units", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: createType,
          name: defaultName(createType),
          spaceID: target.spaceID,
          parentID: target.parentID,
        }),
      });
      openResource(result.resource);
    } catch (caught) {
      showToast(caught instanceof Error ? caught.message : String(caught));
      button.disabled = false;
    }
  }

  function createTarget(): CreateTarget {
    if (route.view === "space") {
      return {
        spaceID: route.spaceID,
        parentID: route.folderID,
      };
    }
    return { spaceID: personalSpace.id, parentID: null };
  }

  renderShell();
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!target.closest(".new-area")) {
      const newMenu = document.querySelector<HTMLElement>("#new-menu");
      if (newMenu) newMenu.hidden = true;
    }
    if (!target.closest(".account")) {
      const accountMenu =
        document.querySelector<HTMLElement>(".account-menu");
      if (accountMenu) accountMenu.hidden = true;
    }
  });
  window.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      document
        .querySelector<HTMLInputElement>(".global-search input")
        ?.focus();
    }
    if (event.key === "Escape") {
      const newMenu = document.querySelector<HTMLElement>("#new-menu");
      if (newMenu) newMenu.hidden = true;
      const preview = document.querySelector<HTMLElement>(
        ".worktree-unit-preview.review-preview-expanded"
      );
      const button = preview?.querySelector<HTMLButtonElement>(
        "[data-review-expand]"
      );
      if (preview && button) {
        setReviewPreviewExpanded(preview, button, false);
      }
    }
  });
  window.addEventListener("hashchange", () => void loadAndRender());
  await loadAndRender();
}

function setReviewPreviewExpanded(
  preview: HTMLElement,
  button: HTMLButtonElement,
  expanded: boolean
): void {
  preview.classList.toggle("review-preview-expanded", expanded);
  document.body.classList.toggle("review-preview-open", expanded);
  button.setAttribute("aria-expanded", String(expanded));
  const icon = button.querySelector<HTMLElement>("span");
  const label = button.querySelector<HTMLElement>("b");
  if (icon) icon.textContent = expanded ? "↙" : "↗";
  if (label) label.textContent = expanded ? "退出沉浸" : "沉浸预览";
}

function homeView(user: CurrentUser, resources: ResourceRecord[]): string {
  const top = resources.slice(0, 3);
  return `
    <section class="page-heading home-heading">
      <div>
        <h1>${greeting()}，${escapeHtml(user.name)}</h1>
        <p>继续最近的工作，或者创建新的内容。</p>
      </div>
    </section>
    <section class="content-section">
      <h2>快速开始</h2>
      <div class="quick-grid">
        ${quickCard(UniverInstanceType.UNIVER_SHEET, "空白表格", "Sheet", "sheet")}
        ${quickCard(UniverInstanceType.UNIVER_DOC, "空白文档", "Doc", "doc")}
        ${quickCard(UniverInstanceType.UNIVER_SLIDE, "空白幻灯片", "Slide", "slide")}
      </div>
    </section>
    <section class="content-section">
      <div class="section-heading">
        <h2>继续处理</h2>
        <a href="#recent">查看全部</a>
      </div>
      ${
        top.length
          ? `<div class="recommend-grid">${top
              .map(recommendationCard)
              .join("")}</div>`
          : emptyState(
              "开始创建你的第一个内容",
              "Sheet、Doc 和 Slide 都会自动连接协同服务。"
            )
      }
    </section>
    ${
      resources.length
        ? `<section class="content-section">
            <h2>最近文件</h2>
            ${resourceTable(resources.slice(0, 5), "recent")}
          </section>`
        : ""
    }
  `;
}

function directoryView(
  directory: DirectoryPayload,
  nodes: DirectoryNode[],
  query: string
): string {
  const canManageMembers =
    directory.space.type === "team";
  const canCreate = directory.space.accessRole !== "viewer";
  const breadcrumbs = [
    `<a href="#space/${directory.space.id}">${escapeHtml(
      directory.space.type === "personal"
        ? "个人空间"
        : directory.space.name
    )}</a>`,
    ...directory.breadcrumbs.map(
      (folder) =>
        `<span>${icon("chevron")}</span><a href="#space/${directory.space.id}/${folder.id}">${escapeHtml(folder.name)}</a>`
    ),
  ].join("");
  const currentName =
    directory.breadcrumbs.at(-1)?.name ??
    (directory.space.type === "personal"
      ? "个人空间"
      : directory.space.name);
  return `
    <section class="page-heading directory-heading">
      <div>
        <nav class="directory-breadcrumbs" aria-label="当前位置">
          ${breadcrumbs}
        </nav>
        <h1>${escapeHtml(currentName)}</h1>
        <p>${
          directory.space.type === "personal"
            ? "仅属于你的目录，可以对单个文档邀请协作者。"
            : `${accessRoleName(directory.space.accessRole)} · 所有内容继承团队权限`
        }</p>
      </div>
      <div class="directory-heading-actions">
        ${
          canManageMembers
            ? `<button id="manage-team-members" class="secondary-button" type="button">
                ${icon("users")}团队成员
              </button>`
            : ""
        }
        ${
          canCreate
            ? `<span class="permission-note">${icon("lock")}内部成员访问</span>`
            : `<span class="access-badge access-viewer">仅查看</span>`
        }
      </div>
    </section>
    <section class="content-section list-section">
      <div class="section-heading directory-section-heading">
        <h2>内容</h2>
        <span class="resource-count">${nodes.length} 项</span>
      </div>
      ${
        nodes.length
          ? nodeTable(nodes, "directory")
          : emptyState(
              query ? "没有匹配的内容" : "这个文件夹是空的",
              query
                ? "试试其他关键词。"
                : canCreate
                  ? "使用左侧“新建”创建文件夹或文档。"
                  : "团队成员还没有在这里创建内容。"
            )
      }
    </section>
  `;
}

function trashView(nodes: DirectoryNode[], query: string): string {
  return `
    <section class="page-heading">
      <div>
        <p class="breadcrumb">回收站</p>
        <h1>已删除内容</h1>
        <p>展示你有管理权限的个人和团队空间内容。</p>
      </div>
      <span class="resource-count">${nodes.length} 项</span>
    </section>
    <section class="content-section list-section">
      ${
        nodes.length
          ? nodeTable(nodes, "trash")
          : emptyState(
              query ? "没有匹配的内容" : "回收站为空",
              query ? "试试其他关键词。" : "删除的内容会显示在这里。"
            )
      }
    </section>
  `;
}

function nodeTable(
  nodes: DirectoryNode[],
  mode: "directory" | "trash"
): string {
  return `
    <div class="resource-table directory-table">
      <div class="resource-table-head">
        <span>名称</span><span>类型</span><span>${
          mode === "trash" ? "所在空间" : "最近活动"
        }</span><span></span>
      </div>
      ${nodes
        .map((node) => {
          const canRename =
            mode === "directory" && node.accessRole !== "viewer";
          const canDelete =
            mode === "directory" &&
            (node.accessRole === "owner" ||
              (node.space.type === "team" &&
                node.accessRole === "admin"));
          const rowTarget =
            mode === "trash"
              ? ""
              : node.kind === "folder"
                ? `data-folder="${node.id}"`
                : `data-open="${node.id}"`;
          return `
            <div class="resource-row${mode === "trash" ? " resource-row-static" : ""}" ${rowTarget}${
              mode === "trash" ? "" : ' tabindex="0"'
            }>
              <span class="resource-name">
                ${
                  node.kind === "folder"
                    ? `<i class="folder-node-icon">${icon("folder")}</i>`
                    : unitIcon(node.type)
                }
                <strong>${escapeHtml(node.name)}</strong>
              </span>
              <span class="resource-meta">${
                node.kind === "folder" ? "文件夹" : typeName(node.type)
              }</span>
              <span class="resource-meta">${
                mode === "trash"
                  ? escapeHtml(node.space.name)
                  : formatRelativeTime(node.updatedAt)
              }</span>
              <span class="row-actions">
                ${
                  canRename
                    ? `<button
                        class="row-action"
                        type="button"
                        data-resource-action
                        data-${
                          node.kind === "folder"
                            ? "rename-folder"
                            : "rename"
                        }="${node.id}"
                        aria-label="重命名"
                        title="重命名"
                      >${icon("edit")}</button>`
                    : ""
                }
                ${
                  canDelete
                    ? `<button
                        class="row-action"
                        type="button"
                        data-resource-action
                        data-delete-node="${node.id}"
                        aria-label="移到回收站"
                        title="移到回收站"
                      >${icon("trash")}</button>`
                    : ""
                }
                ${
                  mode === "trash"
                    ? `<button
                        class="row-action"
                        type="button"
                        data-resource-action
                        data-restore-node="${node.id}"
                        aria-label="恢复"
                        title="恢复"
                      >${icon("restore")}</button>`
                    : ""
                }
              </span>
            </div>`;
        })
        .join("")}
    </div>
  `;
}

function listView(
  view: "recent" | "shared",
  resources: ResourceRecord[],
  query: string
): string {
  const copy = {
    recent: {
      eyebrow: "最近使用",
      title: "最近文件",
      description: "按照你的最近打开时间查看内容。",
    },
    shared: {
      eyebrow: "与我共享",
      title: "共享给我的内容",
      description: "查看其他用户邀请你协作的 Sheet、Doc 和 Slide。",
    },
  }[view];
  return `
    <section class="page-heading">
      <div>
        <p class="breadcrumb">${copy.eyebrow}</p>
        <h1>${copy.title}</h1>
        <p>${copy.description}</p>
      </div>
      <span class="resource-count">${resources.length} 项</span>
    </section>
    <section class="content-section list-section">
      ${
        resources.length
          ? resourceTable(resources, view === "shared" ? "shared" : "recent")
          : emptyState(
              query
                ? "没有匹配的内容"
                : view === "shared"
                    ? "暂时没有共享内容"
                    : view === "recent"
                      ? "最近没有打开内容"
                    : "还没有内容",
              query
                ? "试试其他关键词。"
                : view === "shared"
                    ? "其他用户分享给你的内容会显示在这里。"
                    : view === "recent"
                      ? "打开个人空间或共享给你的内容后，它会显示在这里。"
                    : "点击左侧“新建”开始创建。"
            )
      }
    </section>
  `;
}

function resourceTable(
  resources: ResourceRecord[],
  mode: "shared" | "recent"
): string {
  const shared = mode === "shared";
  const recent = mode === "recent";
  return `
    <div class="resource-table${shared ? " resource-table-shared" : ""}">
      <div class="resource-table-head">
        <span>名称</span><span>${shared ? "所有者" : "类型"}</span><span>${shared ? "权限" : recent ? "最近打开" : "最近活动"}</span><span></span>
      </div>
      ${resources
        .map((resource) => {
          const canRename = resource.accessRole !== "viewer";
          const canDelete =
            mode === "recent" &&
            (resource.accessRole === "owner" ||
              (resource.space.type === "team" &&
                resource.accessRole === "admin"));
          return `
            <div class="resource-row" data-open="${resource.id}" tabindex="0">
              <span class="resource-name">
                ${unitIcon(resource.type)}
                <strong>${escapeHtml(resource.name)}</strong>
              </span>
              <span class="resource-meta">${shared ? escapeHtml(resource.owner.name) : typeName(resource.type)}</span>
              <span class="resource-meta">${
                shared
                  ? `<i class="access-badge access-${resource.accessRole}">${accessRoleName(resource.accessRole)}</i>`
                  : formatRelativeTime(
                      recent ? activityTime(resource) : resource.updatedAt
                    )
              }</span>
              <span class="row-actions">
                ${
                  canRename
                    ? `<button
                        class="row-action"
                        type="button"
                        data-resource-action
                        data-rename="${resource.id}"
                        aria-label="重命名"
                        title="重命名"
                      >${icon("edit")}</button>`
                    : ""
                }
                ${
                  canDelete
                    ? `<button
                        class="row-action"
                        type="button"
                        data-resource-action
                        data-delete-node="${resource.id}"
                        aria-label="移到回收站"
                        title="移到回收站"
                      >
                        ${icon("trash")}
                      </button>`
                    : ""
                }
              </span>
            </div>`;
        })
        .join("")}
    </div>
  `;
}

function recommendationCard(resource: ResourceRecord): string {
  return `
    <article class="recommend-card" data-open="${resource.id}" tabindex="0">
      <div class="document-preview type-${typeSlug(resource.type)}">
        ${previewGraphic(resource.type)}
      </div>
      <div class="recommend-copy">
        <strong>${escapeHtml(resource.name)}</strong>
        <span>${formatRelativeTime(activityTime(resource))}打开</span>
        <small>${typeName(resource.type)}</small>
      </div>
    </article>
  `;
}

function quickCard(
  type: UniverInstanceType,
  title: string,
  label: string,
  slug: string
): string {
  return `
    <button class="quick-card" type="button" data-quick-create="${type}">
      <span class="quick-icon type-${slug}">${unitIcon(type)}</span>
      <span><strong>${title}</strong><small>${label}</small></span>
    </button>
  `;
}

function createMenuItem(
  type: UniverInstanceType,
  title: string,
  slug: string
): string {
  return `
    <button type="button" data-create="${type}">
      <span class="menu-icon type-${slug}">${unitIcon(type)}</span>${title}
    </button>
  `;
}

function navButton(
  view: WorkspaceView,
  label: string,
  iconName: IconName
): string {
  return `<a href="#${view}" data-view="${view}">${icon(iconName)}<span>${label}</span></a>`;
}

function emptyState(title: string, description: string): string {
  return `
    <div class="empty-state">
      <span>${icon("file")}</span>
      <h3>${title}</h3>
      <p>${description}</p>
    </div>
  `;
}

function openResource(resource: ResourceRecord): void {
  const next = new URL(window.location.origin);
  next.searchParams.set("unit", resource.unitID);
  next.searchParams.set("resource", resource.id);
  next.searchParams.set("type", String(resource.type));
  window.location.href = next.toString();
}

function openCreateTeamDialog(
  onCreated: (space: SpaceRecord) => void
): void {
  openTextDialog({
    eyebrow: "团队空间",
    title: "创建团队空间",
    label: "团队名称",
    placeholder: "例如：产品团队",
    submitLabel: "创建",
    async submit(name) {
      const result = await api<{ space: SpaceRecord }>("/api/spaces", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      onCreated(result.space);
      showToast("团队空间已创建");
    },
  });
}

function openCreateFolderDialog(
  target: CreateTarget,
  onCreated: (folder: { readonly id: string }) => void
): void {
  openTextDialog({
    eyebrow: "目录",
    title: "新建文件夹",
    label: "文件夹名称",
    placeholder: "未命名文件夹",
    submitLabel: "创建",
    async submit(name) {
      const result = await api<{ folder: { readonly id: string } }>(
        `/api/spaces/${encodeURIComponent(target.spaceID)}/folders`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name, parentID: target.parentID }),
        }
      );
      onCreated(result.folder);
      showToast("文件夹已创建");
    },
  });
}

function openRenameFolderDialog(
  folder: FolderRecord,
  onRenamed: () => void
): void {
  openTextDialog({
    eyebrow: "文件夹名称",
    title: "重命名",
    label: "名称",
    initialValue: folder.name,
    submitLabel: "保存",
    async submit(name) {
      await api(`/api/folders/${encodeURIComponent(folder.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      onRenamed();
      showToast("文件夹名称已更新");
    },
  });
}

function openTextDialog(options: {
  readonly eyebrow: string;
  readonly title: string;
  readonly label: string;
  readonly initialValue?: string;
  readonly placeholder?: string;
  readonly submitLabel: string;
  readonly submit: (value: string) => Promise<void>;
}): void {
  document.querySelector(".rename-dialog-backdrop")?.remove();
  const backdrop = document.createElement("div");
  backdrop.className = "share-dialog-backdrop rename-dialog-backdrop";
  backdrop.innerHTML = `
    <form class="rename-dialog" role="dialog" aria-modal="true">
      <header>
        <div>
          <p>${escapeHtml(options.eyebrow)}</p>
          <h2>${escapeHtml(options.title)}</h2>
        </div>
        <button class="share-dialog-close" type="button" aria-label="关闭">${icon("close")}</button>
      </header>
      <label>
        <span>${escapeHtml(options.label)}</span>
        <input
          name="name"
          value="${escapeHtml(options.initialValue ?? "")}"
          placeholder="${escapeHtml(options.placeholder ?? "")}"
          maxlength="120"
          required
        />
      </label>
      <p class="form-error rename-error" role="alert" hidden></p>
      <footer>
        <button class="rename-cancel-button" type="button">取消</button>
        <button class="primary-button rename-submit-button" type="submit">${escapeHtml(options.submitLabel)}</button>
      </footer>
    </form>
  `;
  document.body.append(backdrop);

  const form = backdrop.querySelector<HTMLFormElement>("form")!;
  const input = form.querySelector<HTMLInputElement>("input")!;
  const error = form.querySelector<HTMLElement>(".rename-error");
  const close = () => {
    document.removeEventListener("keydown", onKeydown);
    backdrop.remove();
  };
  const onKeydown = (event: KeyboardEvent) => {
    if (event.key === "Escape") close();
  };
  document.addEventListener("keydown", onKeydown);
  backdrop
    .querySelector(".share-dialog-close")
    ?.addEventListener("click", close);
  backdrop
    .querySelector(".rename-cancel-button")
    ?.addEventListener("click", close);
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) close();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const value = input.value.trim();
    if (!value) {
      showInlineError(error, "名称不能为空");
      return;
    }
    input.disabled = true;
    const submit = form.querySelector<HTMLButtonElement>("[type=submit]");
    if (submit) submit.disabled = true;
    try {
      await options.submit(value);
      close();
    } catch (caught) {
      showInlineError(
        error,
        caught instanceof Error ? caught.message : String(caught)
      );
      input.disabled = false;
      if (submit) submit.disabled = false;
      input.focus();
    }
  });
  input.focus();
  input.select();
}

function openRenameDialog(
  resource: { readonly id: string; readonly name: string },
  onRenamed: (resource: ResourceRecord) => void
): void {
  document.querySelector(".rename-dialog-backdrop")?.remove();
  const backdrop = document.createElement("div");
  backdrop.className = "share-dialog-backdrop rename-dialog-backdrop";
  backdrop.innerHTML = `
    <form class="rename-dialog" role="dialog" aria-modal="true" aria-labelledby="rename-title">
      <header>
        <div>
          <p>文件名称</p>
          <h2 id="rename-title">重命名</h2>
        </div>
        <button class="share-dialog-close" type="button" aria-label="关闭">${icon("close")}</button>
      </header>
      <label>
        <span>名称</span>
        <input name="name" value="${escapeHtml(resource.name)}" maxlength="120" required />
      </label>
      <p class="form-error rename-error" role="alert" hidden></p>
      <footer>
        <button class="rename-cancel-button" type="button">取消</button>
        <button class="primary-button rename-submit-button" type="submit">保存</button>
      </footer>
    </form>
  `;
  document.body.append(backdrop);

  const input = backdrop.querySelector<HTMLInputElement>("input[name=name]")!;
  const form = backdrop.querySelector<HTMLFormElement>(".rename-dialog")!;
  const error = backdrop.querySelector<HTMLElement>(".rename-error");
  function close(): void {
    document.removeEventListener("keydown", onKeydown);
    backdrop.remove();
  }
  function onKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") close();
  }
  document.addEventListener("keydown", onKeydown);
  backdrop
    .querySelector(".share-dialog-close")
    ?.addEventListener("click", close);
  backdrop
    .querySelector(".rename-cancel-button")
    ?.addEventListener("click", close);
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) close();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name || name === resource.name) {
      if (!name) showInlineError(error, "名称不能为空");
      else close();
      return;
    }
    const submit = form.querySelector<HTMLButtonElement>("[type=submit]");
    if (submit) submit.disabled = true;
    input.disabled = true;
    try {
      const result = await api<{ resource: ResourceRecord }>(
        `/api/units/${encodeURIComponent(resource.id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name }),
        }
      );
      close();
      onRenamed(result.resource);
      showToast("名称已更新");
    } catch (caught) {
      showInlineError(
        error,
        caught instanceof Error ? caught.message : String(caught)
      );
      input.disabled = false;
      if (submit) submit.disabled = false;
      input.focus();
    }
  });
  input.focus();
  input.select();
}

async function openShareDialog(resource: {
  readonly id: string;
  readonly name: string;
}): Promise<void> {
  document.querySelector(".share-dialog-backdrop")?.remove();
  const backdrop = document.createElement("div");
  backdrop.className = "share-dialog-backdrop";
  backdrop.innerHTML = `
    <section class="share-dialog" role="dialog" aria-modal="true" aria-labelledby="share-title">
      <header class="share-dialog-header">
        <div>
          <p>共享</p>
          <h2 id="share-title">${escapeHtml(resource.name)}</h2>
        </div>
        <button class="share-dialog-close" type="button" aria-label="关闭">${icon("close")}</button>
      </header>
      <div class="share-dialog-body">
        <label class="share-search">
          ${icon("search")}
          <input type="search" placeholder="输入姓名或用户名" aria-label="搜索用户" autocomplete="off" />
        </label>
        <div class="share-search-results" hidden></div>
        <p class="share-section-title">有访问权限的用户</p>
        <div class="share-member-list" aria-live="polite">
          <div class="share-loading"><span class="editor-route-spinner"></span>正在加载…</div>
        </div>
      </div>
      <footer class="share-dialog-footer">
        <p>${icon("lock")}仅受邀用户可以访问，不提供链接分享</p>
      </footer>
    </section>
  `;
  document.body.append(backdrop);

  function close(): void {
    document.removeEventListener("keydown", onKeydown);
    backdrop.remove();
  }
  backdrop
    .querySelector(".share-dialog-close")
    ?.addEventListener("click", close);
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) close();
  });
  function onKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      close();
    }
  }
  document.addEventListener("keydown", onKeydown);

  const memberList =
    backdrop.querySelector<HTMLElement>(".share-member-list")!;
  const resultList =
    backdrop.querySelector<HTMLElement>(".share-search-results")!;
  const search = backdrop.querySelector<HTMLInputElement>(".share-search input")!;
  let members: ShareMember[] = [];
  let searchSequence = 0;

  const renderMembers = () => {
    memberList.innerHTML = members
      .map(
        ({ user, role }) => `
          <div class="share-member">
            <span class="share-avatar">${escapeHtml(initials(user.name))}</span>
            <span class="share-member-copy">
              <strong>${escapeHtml(user.name)}</strong>
              <small>@${escapeHtml(user.username)}</small>
            </span>
            ${
              role === "owner"
                ? `<span class="share-owner-role">所有者</span>`
                : `<select data-member-role="${escapeHtml(user.userId)}" aria-label="${escapeHtml(user.name)}的权限">
                    <option value="editor"${role === "editor" ? " selected" : ""}>可编辑</option>
                    <option value="viewer"${role === "viewer" ? " selected" : ""}>仅查看</option>
                  </select>
                  <button class="share-remove-button" data-remove-member="${escapeHtml(user.userId)}" type="button" aria-label="移除 ${escapeHtml(user.name)}">${icon("close")}</button>`
            }
          </div>`
      )
      .join("");

    memberList
      .querySelectorAll<HTMLSelectElement>("[data-member-role]")
      .forEach((select) => {
        select.addEventListener("change", async () => {
          select.disabled = true;
          try {
            const result = await api<{ member: ShareMember }>(
              `/api/units/${encodeURIComponent(resource.id)}/members/${encodeURIComponent(select.dataset.memberRole!)}`,
              {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ role: select.value }),
              }
            );
            members = members.map((member) =>
              member.user.userId === result.member.user.userId
                ? result.member
                : member
            );
            renderMembers();
            showToast("权限已更新");
          } catch (caught) {
            showToast(caught instanceof Error ? caught.message : String(caught));
            renderMembers();
          }
        });
      });
    memberList
      .querySelectorAll<HTMLButtonElement>("[data-remove-member]")
      .forEach((button) => {
        button.addEventListener("click", async () => {
          button.disabled = true;
          try {
            await api(
              `/api/units/${encodeURIComponent(resource.id)}/members/${encodeURIComponent(button.dataset.removeMember!)}`,
              { method: "DELETE" }
            );
            members = members.filter(
              ({ user }) => user.userId !== button.dataset.removeMember
            );
            renderMembers();
            showToast("已移除访问权限");
          } catch (caught) {
            showToast(caught instanceof Error ? caught.message : String(caught));
            button.disabled = false;
          }
        });
      });
  };

  const renderSearchResults = (users: CurrentUser[]) => {
    const memberIDs = new Set(members.map(({ user }) => user.userId));
    const available = users.filter(({ userId }) => !memberIDs.has(userId));
    resultList.hidden = false;
    resultList.innerHTML = available.length
      ? available
          .map(
            (user) => `
              <button type="button" data-add-member="${escapeHtml(user.userId)}">
                <span class="share-avatar">${escapeHtml(initials(user.name))}</span>
                <span><strong>${escapeHtml(user.name)}</strong><small>@${escapeHtml(user.username)}</small></span>
                <i>添加</i>
              </button>`
          )
          .join("")
      : `<p>没有可添加的用户</p>`;
    resultList
      .querySelectorAll<HTMLButtonElement>("[data-add-member]")
      .forEach((button) => {
        button.addEventListener("click", async () => {
          button.disabled = true;
          try {
            const result = await api<{ member: ShareMember }>(
              `/api/units/${encodeURIComponent(resource.id)}/members`,
              {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  userId: button.dataset.addMember,
                  role: "editor",
                }),
              }
            );
            members = [...members, result.member];
            renderMembers();
            search.value = "";
            resultList.hidden = true;
            showToast(`已邀请 ${result.member.user.name}`);
          } catch (caught) {
            showToast(caught instanceof Error ? caught.message : String(caught));
            button.disabled = false;
          }
        });
      });
  };

  search.addEventListener("input", async () => {
    const query = search.value.trim();
    const sequence = ++searchSequence;
    if (!query) {
      resultList.hidden = true;
      return;
    }
    try {
      const result = await api<{ users: CurrentUser[] }>(
        `/api/users?query=${encodeURIComponent(query)}`
      );
      if (sequence === searchSequence) renderSearchResults(result.users);
    } catch (caught) {
      if (sequence === searchSequence) {
        resultList.hidden = false;
        resultList.innerHTML = `<p>${escapeHtml(caught instanceof Error ? caught.message : String(caught))}</p>`;
      }
    }
  });

  try {
    const result = await api<{ members: ShareMember[] }>(
      `/api/units/${encodeURIComponent(resource.id)}/members`
    );
    members = result.members;
    renderMembers();
    search.focus();
  } catch (caught) {
    memberList.innerHTML = `<p class="share-load-error">${escapeHtml(caught instanceof Error ? caught.message : String(caught))}</p>`;
  }
}

async function openTeamMembersDialog(
  space: Pick<SpaceRecord, "id" | "name" | "type" | "accessRole">
): Promise<void> {
  document.querySelector(".share-dialog-backdrop")?.remove();
  const canManage =
    space.accessRole === "owner" || space.accessRole === "admin";
  const canAssignAdmin = space.accessRole === "owner";
  const backdrop = document.createElement("div");
  backdrop.className = "share-dialog-backdrop";
  backdrop.innerHTML = `
    <section class="share-dialog team-member-dialog" role="dialog" aria-modal="true" aria-labelledby="team-member-title">
      <header class="share-dialog-header">
        <div>
          <p>团队空间</p>
          <h2 id="team-member-title">${escapeHtml(space.name)}</h2>
        </div>
        <button class="share-dialog-close" type="button" aria-label="关闭">${icon("close")}</button>
      </header>
      <div class="share-dialog-body">
        ${
          canManage
            ? `<label class="share-search">
                ${icon("search")}
                <input type="search" placeholder="邀请团队成员" aria-label="搜索用户" autocomplete="off" />
              </label>
              <div class="share-search-results" hidden></div>`
            : ""
        }
        <p class="share-section-title">团队成员</p>
        <div class="share-member-list" aria-live="polite">
          <div class="share-loading"><span class="editor-route-spinner"></span>正在加载…</div>
        </div>
      </div>
      <footer class="share-dialog-footer">
        <p>${icon("lock")}团队内容仅对成员开放，权限由空间角色统一继承</p>
      </footer>
    </section>
  `;
  document.body.append(backdrop);

  const close = () => {
    document.removeEventListener("keydown", onKeydown);
    backdrop.remove();
  };
  const onKeydown = (event: KeyboardEvent) => {
    if (event.key === "Escape") close();
  };
  document.addEventListener("keydown", onKeydown);
  backdrop
    .querySelector(".share-dialog-close")
    ?.addEventListener("click", close);
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) close();
  });

  const memberList =
    backdrop.querySelector<HTMLElement>(".share-member-list")!;
  const resultList =
    backdrop.querySelector<HTMLElement>(".share-search-results");
  const search =
    backdrop.querySelector<HTMLInputElement>(".share-search input");
  let members: TeamMember[] = [];
  let searchSequence = 0;

  const renderMembers = () => {
    memberList.innerHTML = members
      .map(({ user, role }) => {
        const canEditMember =
          canManage &&
          role !== "owner" &&
          !(space.accessRole === "admin" && role === "admin");
        const options = canAssignAdmin
          ? [
              ["admin", "管理员"],
              ["editor", "编辑者"],
              ["viewer", "查看者"],
            ]
          : [
              ["editor", "编辑者"],
              ["viewer", "查看者"],
            ];
        return `
          <div class="share-member">
            <span class="share-avatar">${escapeHtml(initials(user.name))}</span>
            <span class="share-member-copy">
              <strong>${escapeHtml(user.name)}</strong>
              <small>@${escapeHtml(user.username)}</small>
            </span>
            ${
              canEditMember
                ? `<select data-team-member-role="${escapeHtml(user.userId)}" aria-label="${escapeHtml(user.name)}的团队角色">
                    ${options
                      .map(
                        ([value, label]) =>
                          `<option value="${value}"${role === value ? " selected" : ""}>${label}</option>`
                      )
                      .join("")}
                  </select>
                  <button class="share-remove-button" data-remove-team-member="${escapeHtml(user.userId)}" type="button" aria-label="移除 ${escapeHtml(user.name)}">${icon("close")}</button>`
                : `<span class="share-owner-role">${accessRoleName(role)}</span>`
            }
          </div>`;
      })
      .join("");

    memberList
      .querySelectorAll<HTMLSelectElement>("[data-team-member-role]")
      .forEach((select) => {
        select.addEventListener("change", async () => {
          select.disabled = true;
          try {
            const result = await api<{ member: TeamMember }>(
              `/api/spaces/${encodeURIComponent(space.id)}/members/${encodeURIComponent(select.dataset.teamMemberRole!)}`,
              {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ role: select.value }),
              }
            );
            members = members.map((member) =>
              member.user.userId === result.member.user.userId
                ? result.member
                : member
            );
            renderMembers();
            showToast("团队角色已更新");
          } catch (caught) {
            showToast(caught instanceof Error ? caught.message : String(caught));
            renderMembers();
          }
        });
      });
    memberList
      .querySelectorAll<HTMLButtonElement>("[data-remove-team-member]")
      .forEach((button) => {
        button.addEventListener("click", async () => {
          button.disabled = true;
          try {
            await api(
              `/api/spaces/${encodeURIComponent(space.id)}/members/${encodeURIComponent(button.dataset.removeTeamMember!)}`,
              { method: "DELETE" }
            );
            members = members.filter(
              ({ user }) => user.userId !== button.dataset.removeTeamMember
            );
            renderMembers();
            showToast("成员已移出团队");
          } catch (caught) {
            showToast(caught instanceof Error ? caught.message : String(caught));
            button.disabled = false;
          }
        });
      });
  };

  const renderSearchResults = (users: CurrentUser[]) => {
    if (!resultList) return;
    const memberIDs = new Set(members.map(({ user }) => user.userId));
    const available = users.filter(({ userId }) => !memberIDs.has(userId));
    resultList.hidden = false;
    resultList.innerHTML = available.length
      ? available
          .map(
            (user) => `
              <button type="button" data-add-team-member="${escapeHtml(user.userId)}">
                <span class="share-avatar">${escapeHtml(initials(user.name))}</span>
                <span><strong>${escapeHtml(user.name)}</strong><small>@${escapeHtml(user.username)}</small></span>
                <i>邀请</i>
              </button>`
          )
          .join("")
      : `<p>没有可邀请的用户</p>`;
    resultList
      .querySelectorAll<HTMLButtonElement>("[data-add-team-member]")
      .forEach((button) => {
        button.addEventListener("click", async () => {
          button.disabled = true;
          try {
            const result = await api<{ member: TeamMember }>(
              `/api/spaces/${encodeURIComponent(space.id)}/members`,
              {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  userId: button.dataset.addTeamMember,
                  role: "editor",
                }),
              }
            );
            members = [...members, result.member];
            renderMembers();
            if (search) search.value = "";
            resultList.hidden = true;
            showToast(`已邀请 ${result.member.user.name}`);
          } catch (caught) {
            showToast(caught instanceof Error ? caught.message : String(caught));
            button.disabled = false;
          }
        });
      });
  };

  search?.addEventListener("input", async () => {
    const query = search.value.trim();
    const sequence = ++searchSequence;
    if (!query) {
      if (resultList) resultList.hidden = true;
      return;
    }
    try {
      const result = await api<{ users: CurrentUser[] }>(
        `/api/users?query=${encodeURIComponent(query)}`
      );
      if (sequence === searchSequence) renderSearchResults(result.users);
    } catch (caught) {
      if (sequence === searchSequence && resultList) {
        resultList.hidden = false;
        resultList.innerHTML = `<p>${escapeHtml(caught instanceof Error ? caught.message : String(caught))}</p>`;
      }
    }
  });

  try {
    const result = await api<{ members: TeamMember[] }>(
      `/api/spaces/${encodeURIComponent(space.id)}/members`
    );
    members = result.members;
    renderMembers();
    search?.focus();
  } catch (caught) {
    memberList.innerHTML = `<p class="share-load-error">${escapeHtml(caught instanceof Error ? caught.message : String(caught))}</p>`;
  }
}

async function getCurrentUser(): Promise<CurrentUser | null> {
  const response = await fetch("/api/auth/me", { credentials: "include" });
  if (response.status === 401) return null;
  if (!response.ok) return null;
  return ((await response.json()) as { user: CurrentUser }).user;
}

async function api<T = unknown>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(path, { credentials: "include", ...init });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string } | string;
    } | null;
    const message =
      typeof body?.error === "string"
        ? body.error
        : body?.error?.message ?? `请求失败：${response.status}`;
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function requireApp(): HTMLElement {
  const app = document.querySelector<HTMLElement>("#app");
  if (!app) throw new Error("#app is missing");
  return app;
}

function showInlineError(
  element: HTMLElement | null,
  message: string
): void {
  if (!element) return;
  element.hidden = false;
  element.textContent = message;
}

function showToast(message: string): void {
  document.querySelector(".toast")?.remove();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.append(toast);
  window.setTimeout(() => toast.remove(), 3600);
}

function accessRoleName(role: AccessRole): string {
  if (role === "owner") return "所有者";
  if (role === "admin") return "管理员";
  if (role === "editor") return "可编辑";
  return "仅查看";
}

function workspaceRoute(personalSpaceID: string): WorkspaceRoute {
  const parts = window.location.hash
    .slice(1)
    .split("/")
    .filter(Boolean)
    .map(decodeURIComponent);
  if (parts[0] === "space") {
    return {
      view: "space",
      spaceID: parts[1] || personalSpaceID,
      folderID: parts[2] || null,
    };
  }
  const view = parts[0] ?? "";
  return ["home", "recent", "shared", "trash", "worktrees"].includes(
    view
  )
    ? { view: view as Exclude<WorkspaceView, "space"> }
    : { view: "home" };
}

function worktreeMatchesFilter(
  worktree: ReviewWorktree,
  filter: ReviewWorktreeFilter
): boolean {
  if (filter === "all") return true;
  if (filter === "running") {
    return worktree.status === "draft" || worktree.status === "merging";
  }
  if (filter === "ready") return worktree.status === "ready";
  return worktree.status === "merged" || worktree.status === "discarded";
}

function defaultName(type: number): string {
  const time = new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
  return `未命名${typeName(type)} ${time}`;
}

function typeName(type: number): string {
  switch (type) {
    case UniverInstanceType.UNIVER_SHEET:
      return "表格";
    case UniverInstanceType.UNIVER_DOC:
      return "文档";
    case UniverInstanceType.UNIVER_SLIDE:
      return "幻灯片";
    case UniverInstanceType.UNIVER_BOARD:
      return "白板";
    case UniverInstanceType.UNIVER_BASE:
      return "多维表格";
    default:
      return "内容";
  }
}

function typeSlug(type: number): string {
  if (type === UniverInstanceType.UNIVER_SHEET) return "sheet";
  if (type === UniverInstanceType.UNIVER_DOC) return "doc";
  if (type === UniverInstanceType.UNIVER_SLIDE) return "slide";
  return "file";
}

function formatRelativeTime(value: number): string {
  const delta = Math.max(0, Date.now() - value);
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 11) return "早上好";
  if (hour < 14) return "中午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

function initials(name: string): string {
  return [...name.trim()].slice(0, 2).join("").toUpperCase() || "U";
}

function escapeHtml(value: string): string {
  const element = document.createElement("span");
  element.textContent = value;
  return element.innerHTML;
}

function logoIcon(): string {
  return `<span class="logo-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>`;
}

type IconName =
  | "arrow"
  | "chevron"
  | "clock"
  | "close"
  | "edit"
  | "file"
  | "folder"
  | "help"
  | "home"
  | "logout"
  | "link"
  | "lock"
  | "plus"
  | "restore"
  | "search"
  | "share"
  | "sparkles"
  | "trash"
  | "users";

function icon(name: IconName): string {
  const paths: Record<IconName, string> = {
    arrow: '<path d="M5 12h14M14 7l5 5-5 5"/>',
    chevron: '<path d="m8 10 4 4 4-4"/>',
    clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
    close: '<path d="m7 7 10 10M17 7 7 17"/>',
    edit: '<path d="m14 5 5 5M4 20l3.5-.8L19 7.7a1.8 1.8 0 0 0 0-2.5l-.2-.2a1.8 1.8 0 0 0-2.5 0L4.8 16.5z"/>',
    file: '<path d="M7 3h7l4 4v14H7zM14 3v5h5M10 13h5M10 17h5"/>',
    folder: '<path d="M3 6h7l2 2h9v11H3z"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.4 2.4 0 1 1 3 2.3c-.8.3-.8.9-.8 1.7M12 17h.01"/>',
    home: '<path d="m4 10 8-6 8 6v10h-6v-6h-4v6H4z"/>',
    logout: '<path d="M10 5H5v14h5M14 8l4 4-4 4M9 12h9"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l2.3-2.3A4 4 0 0 0 12.3 6L11 7.3M14 10a4 4 0 0 0-5.7 0L6 12.3A4 4 0 0 0 11.7 18l1.3-1.3"/>',
    lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V8a4 4 0 0 1 8 0v2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    restore: '<path d="M4 8v5h5M5 13a7 7 0 1 0 2-7"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
    share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.5M8.2 13.2l7.6 4.5"/>',
    sparkles: '<path d="m12 3 1.4 4.1L17 9l-3.6 1.9L12 15l-1.4-4.1L7 9l3.6-1.9zM18.5 15l.8 2.2 1.7.8-1.7.8-.8 2.2-.8-2.2L16 18l1.7-.8z"/>',
    trash: '<path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/>',
    users: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="10" r="2.5"/><path d="M3 20a6 6 0 0 1 12 0M14 16a5 5 0 0 1 7 4"/>',
  };
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`;
}

function unitIcon(type: number): string {
  if (type === UniverInstanceType.UNIVER_SHEET) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 9h16M10 9v12M4 15h16"/></svg>';
  }
  if (type === UniverInstanceType.UNIVER_DOC) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l4 4v14H6zM14 3v5h5M9 12h6M9 16h6"/></svg>';
  }
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 21l4-3 4 3M7 8h10v6H7z"/></svg>';
}

function previewGraphic(type: number): string {
  if (type === UniverInstanceType.UNIVER_SHEET) {
    return '<span class="sheet-preview"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>';
  }
  if (type === UniverInstanceType.UNIVER_DOC) {
    return '<span class="doc-preview"><i></i><i></i><i></i><i></i><i></i></span>';
  }
  return '<span class="slide-preview"><i></i><b></b><em></em></span>';
}

interface CurrentUser {
  readonly userId: string;
  readonly username: string;
  readonly name: string;
}

interface SpaceRecord {
  readonly id: string;
  readonly type: "personal" | "team";
  readonly name: string;
  readonly accessRole: AccessRole;
  readonly owner: CurrentUser;
}

interface FolderRecord {
  readonly kind: "folder";
  readonly id: string;
  readonly spaceID: string;
  readonly parentID: string | null;
  readonly name: string;
  readonly status: string;
  readonly updatedAt: number;
  readonly accessRole: AccessRole;
}

interface ResourceRecord {
  readonly kind: "unit";
  readonly id: string;
  readonly spaceID: string;
  readonly parentID: string | null;
  readonly unitID: string;
  readonly type: number;
  readonly name: string;
  readonly status: string;
  readonly updatedAt: number;
  readonly lastOpenedAt?: number;
  readonly accessRole: AccessRole;
  readonly space: SpaceRecord;
  readonly owner: CurrentUser;
}

function activityTime(resource: ResourceRecord): number {
  return resource.lastOpenedAt ?? resource.updatedAt;
}

type AccessRole = "owner" | "admin" | "editor" | "viewer";

type DirectoryNode = (FolderRecord | ResourceRecord) & {
  readonly space: SpaceRecord;
};

interface DirectoryPayload {
  readonly space: SpaceRecord;
  readonly breadcrumbs: FolderRecord[];
  readonly nodes: Array<FolderRecord | ResourceRecord>;
}

type WorkspaceRoute =
  | { readonly view: Exclude<WorkspaceView, "space"> }
  | {
      readonly view: "space";
      readonly spaceID: string;
      readonly folderID: string | null;
    };

interface CreateTarget {
  readonly spaceID: string;
  readonly parentID: string | null;
}

interface ShareMember {
  readonly user: CurrentUser;
  readonly role: "owner" | "editor" | "viewer";
}

interface TeamMember {
  readonly user: CurrentUser;
  readonly role: AccessRole;
}
