import type { IGetUserResponse } from "@univerjs/protocol";
import {
  LocaleType,
  LogLevel,
  Univer,
  UniverInstanceType,
  UserManagerService,
} from "@univerjs/core";
import { FUniver } from "@univerjs/core/facade";
import { UniverLicensePlugin } from "@univerjs-pro/license";
import CollaborationClientEnUS from "@univerjs-pro/collaboration-client/locale/en-US";
import CollaborationClientUIEnUS from "@univerjs-pro/collaboration-client-ui/locale/en-US";
import EditHistoryLoaderEnUS from "@univerjs-pro/edit-history-loader/locale/en-US";
import EditHistoryViewerEnUS from "@univerjs-pro/edit-history-viewer/locale/en-US";
import { HTTPService } from "@univerjs/network";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import UniverPresetSheetsCoreEnUS from "@univerjs/preset-sheets-core/locales/en-US";
import {
  createUniver,
  defaultTheme,
  mergeLocales,
} from "@univerjs/presets";
import {
  createUnit,
  getAccess,
  getCurrentUser,
  listMembers,
  listUsers,
  login,
  logout,
  setMemberRole,
  type AuthenticatedUser,
  type UnitRole,
} from "../api";
import { host, httpProtocol, unit, url } from "./consts";
import {
  getCollaborationPlugins,
  getHistoryPlugins,
} from "./plugins";

import "@univerjs/preset-sheets-core/lib/index.css";
import "../global.css";

const loginShell = element<HTMLElement>("login-shell");
const loginForm = element<HTMLFormElement>("login-form");
const loginError = element<HTMLElement>("login-error");
const usernameInput = element<HTMLInputElement>("username");
const passwordInput = element<HTMLInputElement>("password");
const sessionBar = element<HTMLElement>("session-bar");
const sessionUser = element<HTMLElement>("session-user");
const sessionRole = element<HTMLElement>("session-role");
const shareButton = element<HTMLButtonElement>("share-button");
const shareDialog = element<HTMLDialogElement>("share-dialog");
const shareError = element<HTMLElement>("share-error");
const targetUser = element<HTMLSelectElement>("target-user");
const targetRole = element<HTMLSelectElement>("target-role");
const memberList = element<HTMLElement>("member-list");
const pageError = element<HTMLElement>("page-error");

let currentUser: AuthenticatedUser | undefined;

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void signIn(usernameInput.value, passwordInput.value);
});

for (const button of document.querySelectorAll<HTMLButtonElement>(
  "[data-login-user]"
)) {
  button.addEventListener("click", () => {
    const username = button.dataset.loginUser ?? "";
    void signIn(username, `${username}-password`);
  });
}

element<HTMLButtonElement>("logout-button").addEventListener("click", () => {
  void logout().then(() => {
    window.location.href = "/";
  });
});

shareButton.addEventListener("click", () => {
  void openSharing();
});
element<HTMLButtonElement>("close-share").addEventListener("click", () => {
  shareDialog.close();
});
element<HTMLButtonElement>("cancel-share").addEventListener("click", () => {
  shareDialog.close();
});
element<HTMLButtonElement>("grant-member").addEventListener("click", () => {
  void grantMember();
});

void bootstrap();

async function bootstrap(): Promise<void> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      loginShell.hidden = false;
      return;
    }
    await enterApplication(user);
  } catch (error) {
    showPageError(error);
  }
}

async function signIn(username: string, password: string): Promise<void> {
  loginError.textContent = "";
  try {
    const user = await login(username, password);
    await enterApplication(user);
  } catch (error) {
    loginError.textContent = errorMessage(error);
  }
}

async function enterApplication(user: AuthenticatedUser): Promise<void> {
  currentUser = user;
  loginShell.hidden = true;

  if (!unit) {
    const unitID = await createUnit();
    url.searchParams.set("unit", unitID);
    url.searchParams.set("type", String(UniverInstanceType.UNIVER_SHEET));
    window.location.href = url.toString();
    return;
  }

  const role = await getAccess(unit);
  sessionUser.textContent = user.name;
  sessionRole.textContent = role;
  shareButton.hidden = role !== "owner";
  sessionBar.hidden = false;
  initializeUniver();
}

function initializeUniver(): void {
  const { univer, univerAPI } = createUniver({
    locale: LocaleType.EN_US,
    locales: {
      [LocaleType.EN_US]: mergeLocales(
        UniverPresetSheetsCoreEnUS,
        CollaborationClientEnUS,
        CollaborationClientUIEnUS,
        EditHistoryLoaderEnUS,
        EditHistoryViewerEnUS
      ),
    },
    theme: defaultTheme,
    logLevel: LogLevel.VERBOSE,
    collaboration: true,
    presets: [
      UniverSheetsCorePreset({
        container: "app",
      }),
    ],
    plugins: [
      [
        UniverLicensePlugin,
        { license: import.meta.env.VITE_UNIVER_LICENSE || undefined },
      ],
      ...getCollaborationPlugins(),
      ...getHistoryPlugins(),
    ],
  });

  window.univer = univer;
  window.univerAPI = univerAPI;
  void fetchServerUser(univer);
}

async function fetchServerUser(univer: Univer): Promise<void> {
  const injector = univer.__getInjector();
  const userService = injector.get(UserManagerService);
  const httpService = injector.get(HTTPService);
  const response = await httpService.get<IGetUserResponse>(
    `${httpProtocol}://${host}/universer-api/user`
  );
  if (response.body.user) {
    userService.setCurrentUser(response.body.user);
  }
}

async function openSharing(): Promise<void> {
  if (!unit || !currentUser) return;
  shareError.textContent = "";
  try {
    const [users, access] = await Promise.all([
      listUsers(),
      listMembers(unit),
    ]);
    targetUser.replaceChildren(
      ...users
        .filter(({ userId }) => userId !== currentUser?.userId)
        .map((user) => option(user.userId, user.name))
    );
    renderMembers(access.members);
    shareDialog.showModal();
  } catch (error) {
    showPageError(error);
  }
}

async function grantMember(): Promise<void> {
  if (!unit || !targetUser.value) return;
  shareError.textContent = "";
  try {
    await setMemberRole(
      unit,
      targetUser.value,
      targetRole.value as Exclude<UnitRole, "owner">
    );
    renderMembers((await listMembers(unit)).members);
  } catch (error) {
    shareError.textContent = errorMessage(error);
  }
}

function renderMembers(
  members: Awaited<ReturnType<typeof listMembers>>["members"]
): void {
  memberList.replaceChildren(
    ...members.map(({ user, role }) => {
      const row = document.createElement("div");
      row.className = "member";
      const identity = document.createElement("span");
      identity.textContent = user.name;
      const username = document.createElement("small");
      username.textContent = ` @${user.username}`;
      identity.append(username);
      const roleLabel = document.createElement("span");
      roleLabel.textContent = role;
      row.append(identity, roleLabel);
      return row;
    })
  );
}

function option(value: string, label: string): HTMLOptionElement {
  const valueOption = document.createElement("option");
  valueOption.value = value;
  valueOption.textContent = label;
  return valueOption;
}

function showPageError(error: unknown): void {
  pageError.textContent = errorMessage(error);
  pageError.hidden = false;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing #${id}`);
  return value as T;
}

declare global {
  interface Window {
    univer?: Univer;
    univerAPI?: FUniver;
  }
}
