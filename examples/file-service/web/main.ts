import { LocaleType, LogLevel } from "@univerjs/core";
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
import { UniverSheetsDrawingPreset } from "@univerjs/preset-sheets-drawing";
import UniverPresetSheetsDrawingEnUS from "@univerjs/preset-sheets-drawing/locales/en-US";
import { createUniver, defaultTheme, mergeLocales } from "@univerjs/presets";
import "@univerjs-pro/collaboration-client/facade";
import "./styles.css";
import "@univerjs/preset-sheets-core/lib/index.css";
import "@univerjs/preset-sheets-drawing/lib/index.css";
import "@univerjs-pro/collaboration-client-ui/lib/index.css";

document.querySelector<HTMLElement>("#status")!.textContent =
  "Insert → Image → Float Image uploads the file to the application's file service.";

const httpProtocol = location.protocol === "https:" ? "https" : "http";
const wsProtocol = location.protocol === "https:" ? "wss" : "ws";
const baseURL = `${httpProtocol}://${location.host}/universer-api`;

const unitId = new URLSearchParams(location.search).get("unit");
if (!unitId) throw new Error("Open the URL printed by the server; it names the Sheet with ?unit=.");
const { univerAPI } = createUniver({
  locale: LocaleType.EN_US,
  locales: {
    [LocaleType.EN_US]: mergeLocales(
      UniverPresetSheetsCoreEnUS,
      UniverPresetSheetsDrawingEnUS,
      CollaborationClientEnUS,
      CollaborationClientUIEnUS,
    ),
  },
  theme: defaultTheme,
  logLevel: LogLevel.WARN,
  collaboration: true,
  presets: [
    UniverSheetsCorePreset({ container: "app" }),
    // `collaboration: true` keeps the Drawing plugin from registering its base64 image service,
    // so the collaboration client's image service (which calls the URLs below) is the only one.
    UniverSheetsDrawingPreset({ collaboration: true }),
  ],
  plugins: [
    [
      UniverLicensePlugin,
      { license: import.meta.env.UNIVER_LICENSE || undefined },
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
        collabWebSocketUrl: `${wsProtocol}://${location.host}/universer-api/comb/connect`,
        wsSessionTicketUrl: `${baseURL}/user/session-ticket`,
        // File service. The image and attachment services upload here, exchange a file ID for a
        // URL here, and resolve that URL against the download endpoint (see server/files.ts).
        uploadFileServerUrl: `${baseURL}/stream/file/upload`,
        signUrlServerUrl: `${baseURL}/file/{fileID}/sign-url`,
        downloadEndpointUrl: `${httpProtocol}://${location.host}/`,
      },
    ],
    UniverCollaborationClientUIPlugin,
  ],
});

const workbook = await univerAPI.getCollaboration().loadSheetAsync(unitId);
if (!workbook) throw new Error("Document could not be loaded");
