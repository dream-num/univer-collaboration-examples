import { UniverBasesExchangeClientPlugin } from "@univerjs-pro/bases-exchange-client";
import { UniverDocsExchangeClientPlugin } from "@univerjs-pro/docs-exchange-client";
import { UniverExchangeClientPlugin } from "@univerjs-pro/exchange-client";
import { UniverPdfsExchangeClientPlugin } from "@univerjs-pro/pdfs-exchange-client";
import { UniverSheetsExchangeClientPlugin } from "@univerjs-pro/sheets-exchange-client";
import { UniverSlidesExchangeClientPlugin } from "@univerjs-pro/slides-exchange-client";
import type { Plugin, PluginCtor, Univer } from "@univerjs/core";
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

type ExchangePlugin = PluginCtor<Plugin> | [PluginCtor<Plugin>, object];

// Both Office clients load on Sheet and Doc pages: a Sheet can embed a Word file, and a Doc an Excel file.
const OFFICE_CLIENTS: ExchangePlugin[] = [
  [UniverSheetsExchangeClientPlugin, { minSheetRowCount: 100, minSheetColumnCount: 26 }],
  UniverDocsExchangeClientPlugin,
];

/**
 * The exchange client and the menu plugin per Unit type. The Exchange Service does not convert Boards,
 * so a Board page gets no exchange. The exchange clients ship headless since Univer 1.2.0; the menus,
 * dialogs, and upload notifications come from the migration example in the Univer showcase
 * (office.univer.ai/showcase/<type>/custom-import-export), copied as is into ./import-export/<type>/.
 */
const EXCHANGE_PLUGINS: Partial<Record<number, ExchangePlugin[]>> = {
  [UniverType.UNIVER_SHEET]: [...OFFICE_CLIENTS, CustomImportExportPlugin],
  [UniverType.UNIVER_DOC]: [...OFFICE_CLIENTS, CustomDocsImportExportPlugin],
  [UniverType.UNIVER_SLIDE]: [UniverSlidesExchangeClientPlugin, CustomSlidesImportExportPlugin],
  [UniverType.UNIVER_BASE]: [UniverBasesExchangeClientPlugin, CustomBasesImportExportPlugin],
  [UniverType.UNIVER_PDF]: [UniverPdfsExchangeClientPlugin, CustomPdfsImportExportPlugin],
};

export function registerExchange(univer: Univer, baseURL: string, unitType: number) {
  const plugins = EXCHANGE_PLUGINS[unitType];
  if (!plugins) return;

  univer.registerPlugin(UniverExchangeClientPlugin, {
    uploadFileServerUrl: `${baseURL}/stream/file/upload`,
    getTaskServerUrl: `${baseURL}/exchange/task/{taskID}`,
    signUrlServerUrl: `${baseURL}/file/{fileID}/sign-url`,
    importServerUrl: `${baseURL}/exchange/{type}/import`,
    exportServerUrl: `${baseURL}/exchange/{type}/export`,
    downloadEndpointUrl: `${location.protocol}//${location.host}/`,
  });
  for (const plugin of plugins) {
    if (Array.isArray(plugin)) univer.registerPlugin(plugin[0], plugin[1]);
    else univer.registerPlugin(plugin);
  }
}
