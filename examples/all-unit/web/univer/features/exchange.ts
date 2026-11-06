import { UniverBasesExchangeClientPlugin } from "@univerjs-pro/bases-exchange-client";
import { UniverDocsExchangeClientPlugin } from "@univerjs-pro/docs-exchange-client";
import { UniverExchangeClientPlugin } from "@univerjs-pro/exchange-client";
import { UniverPdfsExchangeClientPlugin } from "@univerjs-pro/pdfs-exchange-client";
import { UniverSheetsExchangeClientPlugin } from "@univerjs-pro/sheets-exchange-client";
import { UniverSlidesExchangeClientPlugin } from "@univerjs-pro/slides-exchange-client";
import type { Univer } from "@univerjs/core";
import { UniverType } from "@univerjs/protocol";
import { CustomBasesImportExportPlugin } from "./import-export/bases/plugin";
import { CustomDocsImportExportPlugin } from "./import-export/docs/plugin";
import { CustomPdfsImportExportPlugin } from "./import-export/pdfs/plugin";
import { CustomImportExportPlugin } from "./import-export/sheets/plugin";
import { CustomSlidesImportExportPlugin } from "./import-export/slides/plugin";

import "@univerjs-pro/bases-exchange-client/facade";
import "@univerjs-pro/docs-exchange-client/facade";
import "@univerjs-pro/exchange-client/facade";
import "@univerjs-pro/pdfs-exchange-client/facade";
import "@univerjs-pro/sheets-exchange-client/facade";
import "@univerjs-pro/slides-exchange-client/facade";
import "./import-export/utilities.css";

/** The Exchange Service converts these types. Board is not among them, so a Board page gets no exchange. */
export const EXCHANGE_UNIT_TYPES: readonly number[] = [
  UniverType.UNIVER_SHEET,
  UniverType.UNIVER_DOC,
  UniverType.UNIVER_SLIDE,
  UniverType.UNIVER_BASE,
  UniverType.UNIVER_PDF,
];

/**
 * The exchange clients ship headless since Univer 1.2.0. The menus, dialogs, and upload notifications
 * come from the migration example in the Univer showcase (office.univer.ai/showcase/<type>/custom-import-export),
 * copied as is into ./import-export/<type>/.
 */
export function registerExchange(univer: Univer, baseURL: string, unitType: number) {
  if (!EXCHANGE_UNIT_TYPES.includes(unitType)) return;

  univer.registerPlugin(UniverExchangeClientPlugin, {
    uploadFileServerUrl: `${baseURL}/stream/file/upload`,
    getTaskServerUrl: `${baseURL}/exchange/task/{taskID}`,
    signUrlServerUrl: `${baseURL}/file/{fileID}/sign-url`,
    importServerUrl: `${baseURL}/exchange/{type}/import`,
    exportServerUrl: `${baseURL}/exchange/{type}/export`,
    downloadEndpointUrl: `${location.protocol}//${location.host}/`,
  });

  if (unitType === UniverType.UNIVER_SHEET || unitType === UniverType.UNIVER_DOC) {
    // Both clients load on Sheet and Doc pages: a Sheet can embed a Word file, and a Doc an Excel file.
    univer.registerPlugin(UniverSheetsExchangeClientPlugin, { minSheetRowCount: 100, minSheetColumnCount: 26 });
    univer.registerPlugin(UniverDocsExchangeClientPlugin);
    univer.registerPlugin(unitType === UniverType.UNIVER_SHEET ? CustomImportExportPlugin : CustomDocsImportExportPlugin);
  } else if (unitType === UniverType.UNIVER_SLIDE) {
    univer.registerPlugin(UniverSlidesExchangeClientPlugin);
    univer.registerPlugin(CustomSlidesImportExportPlugin);
  } else if (unitType === UniverType.UNIVER_BASE) {
    univer.registerPlugin(UniverBasesExchangeClientPlugin);
    univer.registerPlugin(CustomBasesImportExportPlugin);
  } else if (unitType === UniverType.UNIVER_PDF) {
    univer.registerPlugin(UniverPdfsExchangeClientPlugin);
    univer.registerPlugin(CustomPdfsImportExportPlugin);
  }
}
