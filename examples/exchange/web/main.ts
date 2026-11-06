import { IImageIoService, LocaleType, LogLevel, UniverInstanceType } from "@univerjs/core";
import { UniverDocsDrawingPlugin } from "@univerjs/docs-drawing";
import { UniverDocsDrawingUIPlugin } from "@univerjs/docs-drawing-ui";
import { UniverDrawingPlugin } from "@univerjs/drawing";
import { UniverDrawingUIPlugin } from "@univerjs/drawing-ui";
import { UniverSheetsDrawingPlugin } from "@univerjs/sheets-drawing";
import { UniverSheetsDrawingUIPlugin } from "@univerjs/sheets-drawing-ui";
import { UniverCollaborationPlugin } from "@univerjs-pro/collaboration";
import { UniverCollaborationClientPlugin } from "@univerjs-pro/collaboration-client";
import CollaborationClientEnUS from "@univerjs-pro/collaboration-client/locale/en-US";
import {
  BrowserCollaborationSocketService,
  UniverCollaborationClientUIPlugin,
} from "@univerjs-pro/collaboration-client-ui";
import CollaborationClientUIEnUS from "@univerjs-pro/collaboration-client-ui/locale/en-US";
import { ExchangeFormat, UniverExchangeClientPlugin } from "@univerjs-pro/exchange-client";
import { UniverLicensePlugin } from "@univerjs-pro/license";
import { UniverSheetsExchangeClientPlugin } from "@univerjs-pro/sheets-exchange-client";
import { UniverDocsCorePreset } from "@univerjs/preset-docs-core";
import UniverPresetDocsCoreEnUS from "@univerjs/preset-docs-core/locales/en-US";
import UniverPresetDocsDrawingEnUS from "@univerjs/preset-docs-drawing/locales/en-US";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import UniverPresetSheetsCoreEnUS from "@univerjs/preset-sheets-core/locales/en-US";
import UniverPresetSheetsDrawingEnUS from "@univerjs/preset-sheets-drawing/locales/en-US";
import { createUniver, defaultTheme, mergeLocales } from "@univerjs/presets";
import "@univerjs-pro/collaboration-client/facade";
import "@univerjs-pro/exchange-client/facade";
import "@univerjs-pro/sheets-exchange-client/facade";
import "./styles.css";
import "@univerjs/preset-sheets-core/lib/index.css";
import "@univerjs/preset-docs-core/lib/index.css";
import "@univerjs/preset-sheets-drawing/lib/index.css";
import "@univerjs/preset-docs-drawing/lib/index.css";
import "@univerjs-pro/collaboration-client-ui/lib/index.css";

document.querySelector<HTMLElement>("#status")!.textContent =
  "Use the toolbar to import XLS/XLSX/CSV/TSV as a new Unit, or export the current revision.";

const baseURL = `${location.protocol}//${location.host}/universer-api`;
const unitId = new URLSearchParams(location.search).get("unit");
if (!unitId) throw new Error("Open the URL printed by the server; it names the Sheet with ?unit=.");
const sheetUnitId: string = unitId;
// Converted attachments open as Docs with `&type=1`.
const isDoc = Number(new URLSearchParams(location.search).get("type")) === UniverInstanceType.UNIVER_DOC;
const linkTo = (id: string, type: UniverInstanceType) => `/?unit=${encodeURIComponent(id)}&type=${type}`;
const { univerAPI } = createUniver({
  locale: LocaleType.EN_US,
  locales: {
    [LocaleType.EN_US]: mergeLocales(
      UniverPresetSheetsCoreEnUS,
      UniverPresetDocsCoreEnUS,
      UniverPresetSheetsDrawingEnUS,
      UniverPresetDocsDrawingEnUS,
      CollaborationClientEnUS,
      CollaborationClientUIEnUS,
      // The two exchange packages do not publish locale entry points.
    ),
  },
  theme: defaultTheme,
  logLevel: LogLevel.WARN,
  collaboration: true,
  presets: [
    isDoc ? UniverDocsCorePreset({ container: "app" }) : UniverSheetsCorePreset({ container: "app" }),
  ],
  plugins: [
    [UniverDrawingPlugin, { override: [[IImageIoService, null]], ole: { getLink: linkTo } }],
    UniverDrawingUIPlugin,
    UniverDocsDrawingPlugin,
    ...(isDoc ? [UniverDocsDrawingUIPlugin] : [UniverSheetsDrawingPlugin, UniverSheetsDrawingUIPlugin]),
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
        collabWebSocketUrl: `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/universer-api/comb/connect`,
        wsSessionTicketUrl: `${baseURL}/user/session-ticket`,
        uploadFileServerUrl: `${baseURL}/stream/file/upload`,
        signUrlServerUrl: `${baseURL}/file/{fileID}/sign-url`,
        downloadEndpointUrl: `${location.protocol}//${location.host}/`,
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

const collaboration = univerAPI.getCollaboration();
const workbook = isDoc ? await collaboration.loadDocAsync(unitId) : await collaboration.loadSheetAsync(unitId);
if (!workbook) throw new Error("Document could not be loaded");

// Since SDK 1.2.0 the exchange packages ship headless: there are no built-in ribbon entries, so the
// host application owns the entry points and calls the Facade instead.
const toolbar = document.querySelector<HTMLElement>("#toolbar")!;
const status = document.querySelector<HTMLElement>("#status")!;
toolbar.innerHTML = `
  <label class="exchange-action" for="exchange-import">Import</label>
  <input id="exchange-import" type="file" accept=".xlsx,.xls,.csv,.tsv" hidden />
  <button class="exchange-action" id="exchange-export-xlsx" type="button">Export XLSX</button>
  <button class="exchange-action" id="exchange-export-csv" type="button">Export CSV</button>
`;
if (isDoc) toolbar.style.display = "none";

async function exportCurrentSheet(format: ExchangeFormat, extension: string) {
  status.textContent = `Exporting ${extension.toUpperCase()}…`;
  try {
    // A CSV file holds one worksheet, so the export names which one; XLSX ignores it.
    const sheetId = univerAPI.getActiveWorkbook()?.getActiveSheet().getSheetId();
    const options = format === ExchangeFormat.XLSX ? ({ oleAttachmentSource: "online" } as const) : undefined;
    const file = await univerAPI.exportSheetByUnitIdAsync(sheetUnitId, format, sheetId, options);
    if (!file) throw new Error("Export did not produce a file.");
    univerAPI.downloadFile(file, sheetUnitId, extension);
    status.textContent = `Exported the current revision as ${extension.toUpperCase()}.`;
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : String(error);
  }
}

toolbar
  .querySelector<HTMLInputElement>("#exchange-import")!
  .addEventListener("change", async (event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    status.textContent = `Importing ${file.name}…`;
    try {
      const importedUnitId = await univerAPI.importSheetToUnitIdAsync(file);
      if (!importedUnitId) throw new Error("Import did not produce a collaborative Unit.");
      location.href = `/?unit=${encodeURIComponent(importedUnitId)}`;
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : String(error);
      input.value = "";
    }
  });

toolbar
  .querySelector("#exchange-export-xlsx")!
  .addEventListener("click", () => void exportCurrentSheet(ExchangeFormat.XLSX, "xlsx"));
toolbar
  .querySelector("#exchange-export-csv")!
  .addEventListener("click", () => void exportCurrentSheet(ExchangeFormat.CSV, "csv"));
