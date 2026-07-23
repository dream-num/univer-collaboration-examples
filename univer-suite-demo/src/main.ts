import { UniverInstanceType } from "@univerjs/core";
import { PRESET_USERS } from "../shared/preset-users.js";
import "./styles.css";

type WorkspaceView = "home" | "recent" | "space" | "trash";

const url = new URL(window.location.href);
const unitID = url.searchParams.get("unit");
const resourceID = url.searchParams.get("resource");
const type = Number(url.searchParams.get("type"));

void start();

async function start(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) {
    renderAuth("login");
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

function renderAuth(mode: "login" | "register"): void {
  const isRegister = mode === "register";
  const app = requireApp();
  app.innerHTML = `
    <main class="auth-page">
      <a class="auth-brand" href="/" aria-label="Univer Suite 首页">
        ${logoIcon()}
        <span>Univer Suite</span>
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
  const app = requireApp();
  app.innerHTML = `
    <div class="editor-shell">
      <header class="editor-header">
        <a class="editor-brand" href="/">
          ${logoIcon()}
          <span>Univer</span>
        </a>
        <span class="editor-divider"></span>
        <span id="editor-title">正在加载…</span>
        <span class="editor-status"><i></i> 已连接</span>
      </header>
      <main id="univer-container"></main>
    </div>
  `;
  const detail = resourceID
    ? await api<{ resource: ResourceRecord }>(
        `/api/units/${encodeURIComponent(resourceID)}`
      ).catch(() => null)
    : null;
  const title = document.querySelector("#editor-title");
  if (title) title.textContent = detail?.resource.name ?? editorUnitID;

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

async function renderWorkspace(user: CurrentUser): Promise<void> {
  const app = requireApp();
  let resources: ResourceRecord[] = [];
  let view = viewFromHash();
  let query = "";

  app.innerHTML = `
    <div class="suite-shell">
      <header class="topbar">
        <a class="topbar-brand" href="#home">
          ${logoIcon()}
          <span>Univer</span>
        </a>
        <label class="global-search">
          ${icon("search")}
          <input type="search" placeholder="搜索文档" aria-label="搜索文档" />
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
            ${createMenuItem(UniverInstanceType.UNIVER_SHEET, "空白表格", "sheet")}
            ${createMenuItem(UniverInstanceType.UNIVER_DOC, "空白文档", "doc")}
            ${createMenuItem(UniverInstanceType.UNIVER_SLIDE, "空白幻灯片", "slide")}
          </div>
        </div>
        <nav class="main-nav" aria-label="主要导航">
          ${navButton("home", "首页", "home")}
          ${navButton("recent", "最近使用", "clock")}
          ${navButton("space", "个人空间", "folder")}
          ${navButton("trash", "回收站", "trash")}
        </nav>
        <div class="sidebar-footer">
          <span>${icon("sparkles")}</span>
          <p><strong>协同已启用</strong><small>Sheet、Doc、Slide</small></p>
        </div>
      </aside>
      <main id="workspace-content" class="workspace-content" tabindex="-1"></main>
    </div>
  `;

  const accountButton = document.querySelector<HTMLButtonElement>(".avatar-button");
  const accountMenu = document.querySelector<HTMLElement>(".account-menu");
  accountButton?.addEventListener("click", () => {
    if (accountMenu) accountMenu.hidden = !accountMenu.hidden;
  });
  document.querySelector("#logout-button")?.addEventListener("click", async () => {
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

  document.querySelectorAll<HTMLAnchorElement>("[data-view]").forEach((link) => {
    link.addEventListener("click", () => {
      view = (link.dataset.view as WorkspaceView) ?? "home";
      void loadAndRender();
    });
  });

  const search = document.querySelector<HTMLInputElement>(".global-search input");
  search?.addEventListener("input", () => {
    query = search.value.trim().toLocaleLowerCase();
    renderCurrentView();
  });
  window.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      search?.focus();
    }
  });
  window.addEventListener("hashchange", () => {
    view = viewFromHash();
    void loadAndRender();
  });

  async function loadAndRender(): Promise<void> {
    const status = view === "trash" ? "deleted" : "active";
    const result = await api<{ resources: ResourceRecord[] }>(
      `/api/units?status=${status}`
    );
    resources = result.resources;
    renderCurrentView();
  }

  function renderCurrentView(): void {
    document.querySelectorAll<HTMLElement>("[data-view]").forEach((item) => {
      item.classList.toggle("active", item.dataset.view === view);
    });
    const filtered = resources.filter((resource) =>
      resource.name.toLocaleLowerCase().includes(query)
    );
    const content = document.querySelector<HTMLElement>("#workspace-content");
    if (!content) return;
    if (view === "home") {
      content.innerHTML = homeView(user, filtered);
    } else {
      content.innerHTML = listView(view, filtered, query);
    }
    wireContentActions();
  }

  function wireContentActions(): void {
    document
      .querySelectorAll<HTMLButtonElement>("[data-quick-create]")
      .forEach((button) => {
        button.addEventListener("click", () =>
          void createResource(Number(button.dataset.quickCreate), button)
        );
      });
    document.querySelectorAll<HTMLElement>("[data-open]").forEach((item) => {
      item.addEventListener("click", (event) => {
        if ((event.target as HTMLElement).closest("[data-resource-action]")) {
          return;
        }
        const resource = resources.find(({ id }) => id === item.dataset.open);
        if (resource) openResource(resource);
      });
      item.addEventListener("keydown", (event) => {
        if (event.key === "Enter") item.click();
      });
    });
    document
      .querySelectorAll<HTMLButtonElement>("[data-delete]")
      .forEach((button) => {
        button.addEventListener("click", async () => {
          button.disabled = true;
          await api(`/api/units/${encodeURIComponent(button.dataset.delete!)}`, {
            method: "DELETE",
          });
          await loadAndRender();
        });
      });
    document
      .querySelectorAll<HTMLButtonElement>("[data-restore]")
      .forEach((button) => {
        button.addEventListener("click", async () => {
          button.disabled = true;
          await api(
            `/api/units/${encodeURIComponent(button.dataset.restore!)}/restore`,
            { method: "POST" }
          );
          await loadAndRender();
        });
      });
  }

  async function createResource(
    createType: number,
    button: HTMLButtonElement
  ): Promise<void> {
    button.disabled = true;
    try {
      const result = await api<{ resource: ResourceRecord }>("/api/units", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: createType,
          name: defaultName(createType),
        }),
      });
      openResource(result.resource);
    } catch (caught) {
      showToast(caught instanceof Error ? caught.message : String(caught));
      button.disabled = false;
    }
  }

  await loadAndRender();
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
            ${resourceTable(resources.slice(0, 5), "active")}
          </section>`
        : ""
    }
  `;
}

function listView(
  view: Exclude<WorkspaceView, "home">,
  resources: ResourceRecord[],
  query: string
): string {
  const copy = {
    recent: {
      eyebrow: "最近使用",
      title: "最近文件",
      description: "按照最近活动时间查看你的内容。",
    },
    space: {
      eyebrow: "个人空间",
      title: "我的内容",
      description: "你创建的所有 Sheet、Doc 和 Slide。",
    },
    trash: {
      eyebrow: "回收站",
      title: "已删除",
      description: "删除的内容仍保留协同数据，可以随时恢复。",
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
          ? resourceTable(resources, view === "trash" ? "deleted" : "active")
          : emptyState(
              query ? "没有匹配的内容" : view === "trash" ? "回收站为空" : "还没有内容",
              query
                ? "试试其他关键词。"
                : view === "trash"
                  ? "移到回收站的内容会显示在这里。"
                  : "点击左侧“新建”开始创建。"
            )
      }
    </section>
  `;
}

function resourceTable(
  resources: ResourceRecord[],
  status: "active" | "deleted"
): string {
  return `
    <div class="resource-table">
      <div class="resource-table-head">
        <span>名称</span><span>类型</span><span>最近活动</span><span></span>
      </div>
      ${resources
        .map(
          (resource) => `
            <div class="resource-row" data-open="${resource.id}" tabindex="0">
              <span class="resource-name">
                ${unitIcon(resource.type)}
                <strong>${escapeHtml(resource.name)}</strong>
              </span>
              <span class="resource-meta">${typeName(resource.type)}</span>
              <span class="resource-meta">${formatRelativeTime(resource.updatedAt)}</span>
              <button
                class="row-action"
                type="button"
                data-resource-action
                data-${status === "active" ? "delete" : "restore"}="${resource.id}"
                aria-label="${status === "active" ? "移到回收站" : "恢复"}"
                title="${status === "active" ? "移到回收站" : "恢复"}"
              >
                ${icon(status === "active" ? "trash" : "restore")}
              </button>
            </div>`
        )
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
        <span>${formatRelativeTime(resource.updatedAt)}打开</span>
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

function viewFromHash(): WorkspaceView {
  const candidate = window.location.hash.slice(1);
  return ["home", "recent", "space", "trash"].includes(candidate)
    ? (candidate as WorkspaceView)
    : "home";
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
  | "file"
  | "folder"
  | "help"
  | "home"
  | "logout"
  | "plus"
  | "restore"
  | "search"
  | "sparkles"
  | "trash";

function icon(name: IconName): string {
  const paths: Record<IconName, string> = {
    arrow: '<path d="M5 12h14M14 7l5 5-5 5"/>',
    chevron: '<path d="m8 10 4 4 4-4"/>',
    clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
    file: '<path d="M7 3h7l4 4v14H7zM14 3v5h5M10 13h5M10 17h5"/>',
    folder: '<path d="M3 6h7l2 2h9v11H3z"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.4 2.4 0 1 1 3 2.3c-.8.3-.8.9-.8 1.7M12 17h.01"/>',
    home: '<path d="m4 10 8-6 8 6v10h-6v-6h-4v6H4z"/>',
    logout: '<path d="M10 5H5v14h5M14 8l4 4-4 4M9 12h9"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    restore: '<path d="M4 8v5h5M5 13a7 7 0 1 0 2-7"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
    sparkles: '<path d="m12 3 1.4 4.1L17 9l-3.6 1.9L12 15l-1.4-4.1L7 9l3.6-1.9zM18.5 15l.8 2.2 1.7.8-1.7.8-.8 2.2-.8-2.2L16 18l1.7-.8z"/>',
    trash: '<path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/>',
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

interface ResourceRecord {
  readonly id: string;
  readonly unitID: string;
  readonly type: number;
  readonly name: string;
  readonly status: string;
  readonly updatedAt: number;
}
