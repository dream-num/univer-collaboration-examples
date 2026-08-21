import { LocaleType, LogLevel } from "@univerjs/core";
import { UniverCollaborationPlugin } from "@univerjs-pro/collaboration";
import { UniverCollaborationClientPlugin } from "@univerjs-pro/collaboration-client";
import CollaborationClientEnUS from "@univerjs-pro/collaboration-client/locale/en-US";
import {
  BrowserCollaborationSocketService,
  UniverCollaborationClientUIPlugin,
} from "@univerjs-pro/collaboration-client-ui";
import CollaborationClientUIEnUS from "@univerjs-pro/collaboration-client-ui/locale/en-US";
import { UniverExchangeClientPlugin } from "@univerjs-pro/exchange-client";
import ExchangeClientEnUS from "@univerjs-pro/exchange-client/locale/en-US";
import { UniverLicensePlugin } from "@univerjs-pro/license";
import { UniverSheetsExchangeClientPlugin } from "@univerjs-pro/sheets-exchange-client";
import SheetsExchangeClientEnUS from "@univerjs-pro/sheets-exchange-client/locale/en-US";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import UniverPresetSheetsCoreEnUS from "@univerjs/preset-sheets-core/locales/en-US";
import { createUniver, defaultTheme, mergeLocales } from "@univerjs/presets";
import "@univerjs-pro/exchange-client/facade";
import "@univerjs-pro/sheets-exchange-client/facade";
import "./styles.css";
import "@univerjs/preset-sheets-core/lib/index.css";
import "@univerjs-pro/collaboration-client-ui/lib/index.css";
import "@univerjs-pro/exchange-client/lib/index.css";

document.querySelector<HTMLElement>("#status")!.textContent =
  "Use File in the ribbon to import XLS/XLSX/CSV/TSV or export XLSX/CSV/TSV.";

const baseURL = `${location.protocol}//${location.host}/universer-api`;
createUniver({
  locale: LocaleType.EN_US,
  locales: {
    [LocaleType.EN_US]: mergeLocales(
      UniverPresetSheetsCoreEnUS,
      CollaborationClientEnUS,
      CollaborationClientUIEnUS,
      ExchangeClientEnUS,
      SheetsExchangeClientEnUS,
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
      UniverExchangeClientPlugin,
      {
        uploadFileServerUrl: `${baseURL}/stream/file/upload`,
        getTaskServerUrl: `${baseURL}/exchange/task/{taskID}`,
        signUrlServerUrl: `${baseURL}/file/{fileID}/sign-url`,
        importServerUrl: `${baseURL}/exchange/{type}/import`,
        exportServerUrl: `${baseURL}/exchange/{type}/export`,
        downloadEndpointUrl: `${location.protocol}//${location.host}/`,
      },
    ],
    [
      UniverSheetsExchangeClientPlugin,
      { minSheetRowCount: 100, minSheetColumnCount: 26 },
    ],
  ],
});
