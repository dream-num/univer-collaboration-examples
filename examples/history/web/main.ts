import { LocaleType, LogLevel } from "@univerjs/core";
import { UniverCollaborationPlugin } from "@univerjs-pro/collaboration";
import { UniverCollaborationClientPlugin } from "@univerjs-pro/collaboration-client";
import CollaborationClientEnUS from "@univerjs-pro/collaboration-client/locale/en-US";
import {
  BrowserCollaborationSocketService,
  UniverCollaborationClientUIPlugin,
} from "@univerjs-pro/collaboration-client-ui";
import CollaborationClientUIEnUS from "@univerjs-pro/collaboration-client-ui/locale/en-US";
import {
  ToggleEditHistoryOperation,
  UniverEditHistoryLoaderPlugin,
} from "@univerjs-pro/edit-history-loader";
import EditHistoryLoaderEnUS from "@univerjs-pro/edit-history-loader/locale/en-US";
import EditHistoryViewerEnUS from "@univerjs-pro/edit-history-viewer/locale/en-US";
import { UniverLicensePlugin } from "@univerjs-pro/license";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import UniverPresetSheetsCoreEnUS from "@univerjs/preset-sheets-core/locales/en-US";
import { createUniver, defaultTheme, mergeLocales } from "@univerjs/presets";
import "./styles.css";
import "@univerjs/preset-sheets-core/lib/index.css";
import "@univerjs-pro/collaboration-client-ui/lib/index.css";
import "@univerjs-pro/edit-history-viewer/lib/index.css";

document.querySelector<HTMLElement>("#toolbar")!.innerHTML =
  '<button id="history">History</button>';
document.querySelector<HTMLElement>("#status")!.textContent =
  "Edit the Sheet, then click History.";
const baseURL = `${location.protocol}//${location.host}/universer-api`;
const { univerAPI } = createUniver({
  locale: LocaleType.EN_US,
  locales: {
    [LocaleType.EN_US]: mergeLocales(
      UniverPresetSheetsCoreEnUS,
      CollaborationClientEnUS,
      CollaborationClientUIEnUS,
      EditHistoryLoaderEnUS,
      EditHistoryViewerEnUS,
    ),
  },
  theme: defaultTheme,
  logLevel: LogLevel.WARN,
  collaboration: true,
  presets: [UniverSheetsCorePreset({ container: "app" })],
  plugins: [
    [
      UniverLicensePlugin,
      { license: import.meta.env.VITE_UNIVER_LICENSE || undefined },
    ],
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
    [
      UniverEditHistoryLoaderPlugin,
      { historyListServerUrl: `${baseURL}/history`, univerContainerId: "app" },
    ],
  ],
});

document.querySelector<HTMLButtonElement>("#history")!.onclick = () =>
  univerAPI.executeCommand(ToggleEditHistoryOperation.id);
