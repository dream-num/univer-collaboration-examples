import { LocaleType, LogLevel, UserManagerService } from "@univerjs/core";
import { UniverCollaborationPlugin } from "@univerjs-pro/collaboration";
import { UniverCollaborationClientPlugin } from "@univerjs-pro/collaboration-client";
import CollaborationClientEnUS from "@univerjs-pro/collaboration-client/locale/en-US";
import {
  BrowserCollaborationSocketService,
  UniverCollaborationClientUIPlugin,
} from "@univerjs-pro/collaboration-client-ui";
import CollaborationClientUIEnUS from "@univerjs-pro/collaboration-client-ui/locale/en-US";
import { UniverLicensePlugin } from "@univerjs-pro/license";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import UniverPresetSheetsCoreEnUS from "@univerjs/preset-sheets-core/locales/en-US";
import { createUniver, defaultTheme, mergeLocales } from "@univerjs/presets";
import type { DemoUser } from "../shared/types";
import "@univerjs/preset-sheets-core/lib/index.css";
import "@univerjs-pro/collaboration-client-ui/lib/index.css";

import "./styles.css";

const currentUser = document.getElementById("current-user")!;
const state = document.getElementById("state")!;

async function start() {
  const response = await fetch("/universer-api/demo/me");
  if (response.status === 401) {
    state.textContent = "Choose an account to open the sheet.";
    return;
  }
  if (!response.ok) throw new Error("Unable to load current user.");
  const user = (await response.json()) as DemoUser;
  currentUser.textContent = user.username;
  document.getElementById("sign-out")!.hidden = false;
  document.querySelector(`[data-user-id="${user.userId}"]`)?.setAttribute("aria-current", "true");
  if (!new URLSearchParams(location.search).has("unit")) {
    state.textContent = "Choose an account to open the sheet.";
    return;
  }

  const baseURL = `${location.protocol}//${location.host}/universer-api`;
  const { univer, univerAPI } = createUniver({
    locale: LocaleType.EN_US,
    locales: {
      [LocaleType.EN_US]: mergeLocales(
        UniverPresetSheetsCoreEnUS,
        CollaborationClientEnUS,
        CollaborationClientUIEnUS,
      ),
    },
    theme: defaultTheme,
    logLevel: LogLevel.WARN,
    collaboration: true,
    presets: [UniverSheetsCorePreset({ container: "app", ribbonType: "grid" })],
    plugins: [
      [UniverLicensePlugin, { license: import.meta.env.UNIVER_LICENSE || undefined }],
      UniverCollaborationPlugin,
      [
        UniverCollaborationClientPlugin,
        {
          socketService: BrowserCollaborationSocketService,
          sendChangesetTimeout: 200,
          authzUrl: `${baseURL}/authz`,
          snapshotServerUrl: `${baseURL}/snapshot`,
          collabSubmitChangesetUrl: `${baseURL}/comb`,
          collabWebSocketUrl: `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/universer-api/comb/connect`,
          wsSessionTicketUrl: `${baseURL}/user/session-ticket`,
        },
      ],
      UniverCollaborationClientUIPlugin,
    ],
  });

  // Map the application user to Univer’s current user for client components.
  univer.__getInjector().get(UserManagerService).setCurrentUser({
    userID: user.userId,
    name: user.username,
    avatar: user.avatar,
  });
  currentUser.textContent = univerAPI.getUserManager().getCurrentUser().name;
  state.hidden = true;
}

start().catch((error: unknown) => {
  console.error(error);
  state.textContent = "Unable to open this sheet. Please reload to try again.";
});
