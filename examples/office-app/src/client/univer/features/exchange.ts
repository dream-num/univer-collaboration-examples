import { UniverBasesExchangeClientPlugin } from "@univerjs-pro/bases-exchange-client";
import { UniverBoardsExchangeClientPlugin } from "@univerjs-pro/boards-exchange-client";
import { UniverBoardsPrintPlugin } from "@univerjs-pro/boards-print";
import { UniverDocsExchangeClientPlugin } from "@univerjs-pro/docs-exchange-client";
import { UniverDocsPrintPlugin } from "@univerjs-pro/docs-print";
import { UniverExchangeClientPlugin } from "@univerjs-pro/exchange-client";
import { UniverSheetsExchangeClientPlugin } from "@univerjs-pro/sheets-exchange-client";
import { UniverSheetsPrintPlugin } from "@univerjs-pro/sheets-print";
import { UniverSlidesExchangeClientPlugin } from "@univerjs-pro/slides-exchange-client";
import { UniverSlidesPrintPlugin } from "@univerjs-pro/slides-print";
import type { Univer } from "@univerjs/core";
import { UniverType } from "@univerjs/protocol";

export function registerExchangeAndPrint(
  univer: Univer,
  unitType: number,
  baseURL: string,
) {
  univer.registerPlugin(UniverExchangeClientPlugin, {
    uploadFileServerUrl: `${baseURL}/stream/file/upload`,
    getTaskServerUrl: `${baseURL}/exchange/task/{taskID}`,
    signUrlServerUrl: `${baseURL}/file/{fileID}/sign-url`,
    importServerUrl: `${baseURL}/exchange/{type}/import`,
    exportServerUrl: `${baseURL}/exchange/{type}/export`,
    downloadEndpointUrl: `${location.origin}/`,
  });

  if (unitType === UniverType.UNIVER_DOC) {
    univer.registerPlugin(UniverDocsExchangeClientPlugin);
  } else if (unitType === UniverType.UNIVER_SHEET) {
    univer.registerPlugin(UniverSheetsExchangeClientPlugin);
  } else if (unitType === UniverType.UNIVER_SLIDE) {
    univer.registerPlugin(UniverSlidesExchangeClientPlugin);
  } else if (unitType === UniverType.UNIVER_BOARD) {
    univer.registerPlugin(UniverBoardsExchangeClientPlugin);
  } else if (unitType === UniverType.UNIVER_BASE) {
    univer.registerPlugin(UniverBasesExchangeClientPlugin);
  }

  if (unitType === UniverType.UNIVER_DOC) {
    univer.registerPlugin(UniverDocsPrintPlugin);
  } else if (unitType === UniverType.UNIVER_SHEET) {
    univer.registerPlugin(UniverSheetsPrintPlugin);
  } else if (unitType === UniverType.UNIVER_SLIDE) {
    univer.registerPlugin(UniverSlidesPrintPlugin);
  } else if (unitType === UniverType.UNIVER_BOARD) {
    univer.registerPlugin(UniverBoardsPrintPlugin);
  }
}
