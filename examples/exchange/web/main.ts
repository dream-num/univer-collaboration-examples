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
import { UniverDocsExchangeClientPlugin } from "@univerjs-pro/docs-exchange-client";
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
import "@univerjs-pro/docs-exchange-client/facade";
import "@univerjs-pro/exchange-client/facade";
import "@univerjs-pro/sheets-exchange-client/facade";
import "./styles.css";
import "@univerjs/preset-sheets-core/lib/index.css";
import "@univerjs/preset-docs-core/lib/index.css";
import "@univerjs/preset-sheets-drawing/lib/index.css";
import "@univerjs/preset-docs-drawing/lib/index.css";
import "@univerjs-pro/collaboration-client-ui/lib/index.css";

const baseURL = `${location.protocol}//${location.host}/universer-api`;
const unitId = new URLSearchParams(location.search).get("unit");
if (!unitId) throw new Error("Open the URL printed by the server; it names the Unit with ?unit=.");
const currentUnitId: string = unitId;
// Docs open with `&type=1`.
const isDoc = Number(new URLSearchParams(location.search).get("type")) === UniverInstanceType.UNIVER_DOC;
const unitType = isDoc ? UniverInstanceType.UNIVER_DOC : UniverInstanceType.UNIVER_SHEET;
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
    [UniverDrawingPlugin, { override: [[IImageIoService, null]] }],
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
    UniverDocsExchangeClientPlugin,
  ],
});

const collaboration = univerAPI.getCollaboration();
const workbook = isDoc ? await collaboration.loadDocAsync(unitId) : await collaboration.loadSheetAsync(unitId);
if (!workbook) throw new Error("Document could not be loaded");

// Since SDK 1.2.0 the exchange packages ship headless: there are no built-in ribbon entries, so the
// host application owns the entry points and calls the Facade instead.
const toolbar = document.querySelector<HTMLElement>("#toolbar")!;
const status = document.querySelector<HTMLElement>("#status")!;
const importFormats = isDoc ? ".docx,.doc" : ".xlsx,.xls,.csv,.tsv";
const exportFormats = isDoc ? [ExchangeFormat.DOCX] : [ExchangeFormat.XLSX, ExchangeFormat.CSV];
toolbar.innerHTML = `
  <a class="exchange-action" href="${linkTo("exchange-sheet", UniverInstanceType.UNIVER_SHEET)}">Sheet</a>
  <a class="exchange-action" href="${linkTo("exchange-doc", UniverInstanceType.UNIVER_DOC)}">Doc</a>
  <label class="exchange-action" for="exchange-import">Import</label>
  <input id="exchange-import" type="file" accept="${importFormats}" hidden />
  ${exportFormats.map((format) => `<button class="exchange-action" data-format="${format}" type="button">Export ${format.toUpperCase()}</button>`).join("")}
`;
status.textContent = `Use the toolbar to import ${importFormats} as a new Unit, or export the current revision.`;

function exportFile(format: ExchangeFormat) {
  if (isDoc) return univerAPI.exportDocByUnitIdAsync(currentUnitId);
  // A CSV file holds one worksheet, so the export names which one; XLSX ignores it.
  const sheetId = univerAPI.getActiveWorkbook()?.getActiveSheet().getSheetId();
  return univerAPI.exportSheetByUnitIdAsync(currentUnitId, format, sheetId);
}

async function exportCurrentUnit(format: ExchangeFormat) {
  status.textContent = `Exporting ${format.toUpperCase()}…`;
  try {
    const file = await exportFile(format);
    if (!file) throw new Error("Export did not produce a file.");
    univerAPI.downloadFile(file, currentUnitId, format);
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
      const importedUnitId = isDoc
        ? await univerAPI.importDocToUnitIdAsync(file)
        : await univerAPI.importSheetToUnitIdAsync(file);
      if (!importedUnitId) throw new Error("Import did not produce a collaborative Unit.");
      location.href = linkTo(importedUnitId, unitType);
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : String(error);
      input.value = "";
    }
  });

for (const button of toolbar.querySelectorAll<HTMLButtonElement>("[data-format]")) {
  button.addEventListener("click", () => void exportCurrentUnit(button.dataset.format as ExchangeFormat));
}
