import { IImageIoService, LocaleType, LogLevel, UserManagerService } from "@univerjs/core";
import { UniverCollaborationPlugin } from "@univerjs-pro/collaboration";
import { UniverCollaborationClientPlugin } from "@univerjs-pro/collaboration-client";
import CollaborationClientEnUS from "@univerjs-pro/collaboration-client/locale/en-US";
import {
  BrowserCollaborationSocketService,
  UniverCollaborationClientUIPlugin,
} from "@univerjs-pro/collaboration-client-ui";
import CollaborationClientUIEnUS from "@univerjs-pro/collaboration-client-ui/locale/en-US";
import { UniverLicensePlugin } from "@univerjs-pro/license";
import { UniverThreadCommentDataSourcePlugin } from "@univerjs-pro/thread-comment-datasource";
import { UniverDrawingPlugin } from "@univerjs/drawing";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import UniverPresetSheetsCoreEnUS from "@univerjs/preset-sheets-core/locales/en-US";
import { createUniver, defaultTheme, mergeLocales } from "@univerjs/presets";
import "@univerjs-pro/collaboration-client/facade";
import { UniverSheetsThreadCommentUIPlugin } from "@univerjs/sheets-thread-comment-ui";
import SheetsThreadCommentUIEnUS from "@univerjs/sheets-thread-comment-ui/locale/en-US";
import ThreadCommentUIEnUS from "@univerjs/thread-comment-ui/locale/en-US";
import "./styles.css";
import "@univerjs/preset-sheets-core/lib/index.css";
import "@univerjs-pro/collaboration-client-ui/lib/index.css";
import "@univerjs/sheets-thread-comment-ui/lib/index.css";
import "@univerjs/thread-comment-ui/lib/index.css";

document.querySelector<HTMLElement>("#status")!.textContent =
  "Select a cell and add a thread comment.";
const baseURL = `${location.protocol}//${location.host}/universer-api`;
const unitId = new URLSearchParams(location.search).get("unit");
if (!unitId) throw new Error("Open the URL printed by the server; it names the Sheet with ?unit=.");
const { univer, univerAPI } = createUniver({
  locale: LocaleType.EN_US,
  locales: {
    [LocaleType.EN_US]: mergeLocales(
      UniverPresetSheetsCoreEnUS,
      CollaborationClientEnUS,
      CollaborationClientUIEnUS,
      ThreadCommentUIEnUS,
      SheetsThreadCommentUIEnUS,
    ),
  },
  theme: defaultTheme,
  logLevel: LogLevel.WARN,
  collaboration: true,
  presets: [UniverSheetsCorePreset({ container: "app" })],
  plugins: [
    [
      UniverLicensePlugin,
      { license: import.meta.env.UNIVER_LICENSE || undefined },
    ],
    UniverCollaborationPlugin,
    // Register before the collaboration client plugins: they resolve the image service at startup,
    // and with the override below only the Drawing plugin's base64 implementation provides it.
    UniverDrawingPlugin,
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
        // No file service in this example: drop the collaboration image service so images are
        // embedded as base64 by the Drawing plugin's default implementation.
        override: [[IImageIoService, null]],
      },
    ],
    [UniverCollaborationClientUIPlugin, { enableUrlUnitLoader: false }],
    UniverSheetsThreadCommentUIPlugin,
    UniverThreadCommentDataSourcePlugin,
  ],
});

const currentUser = (await fetch(`${baseURL}/demo/me`).then((response) =>
  response.json(),
)) as { userID: string };
univer.__getInjector().get(UserManagerService).setCurrentUser({
  userID: currentUser.userID,
  name: currentUser.userID,
  avatar: "",
});

const workbook = await univerAPI.getCollaboration().loadSheetAsync(unitId);
if (!workbook) throw new Error("Document could not be loaded");
