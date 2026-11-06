import { UniverBasesHistoryUIPlugin } from "@univerjs-pro/bases-history-ui";
import { UniverBoardsHistoryUIPlugin } from "@univerjs-pro/boards-history-ui";
import { UniverDocsHistoryUIPlugin } from "@univerjs-pro/docs-history-ui";
import { UniverSheetsHistoryUIPlugin } from "@univerjs-pro/sheets-history-ui";
import { UniverSlidesHistoryUIPlugin } from "@univerjs-pro/slides-history-ui";
import type { Univer } from "@univerjs/core";
import { UniverType } from "@univerjs/protocol";
import sheetFormulaWorkerUrl from "../units/sheet/worker?worker&url";

/** Each Unit type has its own history UI. PDF has none, so a PDF page gets no history. */
export function registerHistory(univer: Univer, baseURL: string, container: string, unitType: number) {
  const config = { historyServerUrl: `${baseURL}/history`, univerContainerId: container };
  if (unitType === UniverType.UNIVER_SHEET) {
    // The viewer renders each version in its own Univer and only calculates formulas through this Worker.
    univer.registerPlugin(UniverSheetsHistoryUIPlugin, { ...config, workerURL: sheetFormulaWorkerUrl });
  } else if (unitType === UniverType.UNIVER_DOC) {
    univer.registerPlugin(UniverDocsHistoryUIPlugin, config);
  } else if (unitType === UniverType.UNIVER_SLIDE) {
    univer.registerPlugin(UniverSlidesHistoryUIPlugin, config);
  } else if (unitType === UniverType.UNIVER_BASE) {
    univer.registerPlugin(UniverBasesHistoryUIPlugin, config);
  } else if (unitType === UniverType.UNIVER_BOARD) {
    univer.registerPlugin(UniverBoardsHistoryUIPlugin, config);
  }
}
