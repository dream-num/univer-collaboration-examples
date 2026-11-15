import { LocaleType, LogLevel } from "@univerjs/core";
import { UniverCollaborationPlugin } from "@univerjs-pro/collaboration";
import { UniverCollaborationClientPlugin } from "@univerjs-pro/collaboration-client";
import CollaborationClientEnUS from "@univerjs-pro/collaboration-client/locale/en-US";
import {
  BrowserCollaborationSocketService,
  UniverCollaborationClientUIPlugin,
} from "@univerjs-pro/collaboration-client-ui";
import CollaborationClientUIEnUS from "@univerjs-pro/collaboration-client-ui/locale/en-US";
import { ExchangeFormat } from "@univerjs-pro/exchange-client";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import UniverPresetSheetsCoreEnUS from "@univerjs/preset-sheets-core/locales/en-US";
import { UniverSheetsDrawingPreset } from "@univerjs/preset-sheets-drawing";
import UniverPresetSheetsDrawingEnUS from "@univerjs/preset-sheets-drawing/locales/en-US";
import { UniverSheetsAdvancedPreset } from "@univerjs/preset-sheets-advanced";
import UniverPresetSheetsAdvancedEnUS from "@univerjs/preset-sheets-advanced/locales/en-US";
import { createUniver, defaultTheme, mergeLocales } from "@univerjs/presets";
import "@univerjs-pro/collaboration-client/facade";
import "./styles.css";
import "@univerjs/preset-sheets-core/lib/index.css";
import "@univerjs/preset-sheets-drawing/lib/index.css";
import "@univerjs/preset-sheets-advanced/lib/index.css";
import "@univerjs-pro/collaboration-client-ui/lib/index.css";

const baseURL = `${location.protocol}//${location.host}/universer-api`;
const unitId = new URLSearchParams(location.search).get("unit");
if (!unitId) throw new Error("Open the URL printed by the server; it names the Sheet with ?unit=.");
const sheetUnitId: string = unitId;
const { univerAPI } = createUniver({
  locale: LocaleType.EN_US,
  locales: {
    [LocaleType.EN_US]: mergeLocales(
      UniverPresetSheetsCoreEnUS,
      UniverPresetSheetsDrawingEnUS,
      UniverPresetSheetsAdvancedEnUS,
      CollaborationClientEnUS,
      CollaborationClientUIEnUS,
    ),
  },
  theme: defaultTheme,
  logLevel: LogLevel.WARN,
  collaboration: true,
  presets: [
    UniverSheetsCorePreset({ container: "app" }),
    // collaboration keeps Drawing from registering its own image service.
    UniverSheetsDrawingPreset({ collaboration: true }),
    UniverSheetsAdvancedPreset({
      license: import.meta.env.UNIVER_LICENSE || undefined,
      universerEndpoint: location.origin,
      exchangeClientOptions: { minSheetRowCount: 100, minSheetColumnCount: 26 },
    }),
  ],
  plugins: [
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
  ],
});

const workbook = await univerAPI.getCollaboration().loadSheetAsync(unitId);
if (!workbook) throw new Error("Document could not be loaded");

// Since SDK 1.2.0 the exchange packages ship headless: there are no built-in ribbon entries, so the
// host application owns the entry points and calls the Facade instead.
const toolbar = document.querySelector<HTMLElement>("#toolbar")!;
const status = document.querySelector<HTMLElement>("#status")!;
toolbar.innerHTML = `
  <label class="exchange-action" for="exchange-import">Import</label>
  <input id="exchange-import" type="file" accept=".xlsx,.xls,.csv,.tsv" hidden />
  <button class="exchange-action" data-format="${ExchangeFormat.XLSX}" type="button">Export XLSX</button>
  <button class="exchange-action" data-format="${ExchangeFormat.CSV}" type="button">Export CSV</button>
`;
status.textContent = "Use the toolbar to import XLS/XLSX/CSV/TSV as a new Unit, or export the current revision.";

async function exportCurrentSheet(format: ExchangeFormat) {
  status.textContent = `Exporting ${format.toUpperCase()}…`;
  try {
    // A CSV file holds one worksheet, so the export names which one; XLSX ignores it.
    const sheetId = univerAPI.getActiveWorkbook()?.getActiveSheet().getSheetId();
    const file = await univerAPI.exportSheetByUnitIdAsync(sheetUnitId, format, sheetId);
    if (!file) throw new Error("Export did not produce a file.");
    univerAPI.downloadFile(file, sheetUnitId, format);
    status.textContent = `Exported the current revision as ${format.toUpperCase()}.`;
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

for (const button of toolbar.querySelectorAll<HTMLButtonElement>("[data-format]")) {
  button.addEventListener("click", () => void exportCurrentSheet(button.dataset.format as ExchangeFormat));
}
