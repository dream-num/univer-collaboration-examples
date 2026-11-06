import { UniverBasesHistoryUIPlugin } from "@univerjs-pro/bases-history-ui";
import { UniverBoardsHistoryUIPlugin } from "@univerjs-pro/boards-history-ui";
import { UniverDocsHistoryUIPlugin } from "@univerjs-pro/docs-history-ui";
import { UniverSheetsHistoryUIPlugin } from "@univerjs-pro/sheets-history-ui";
import { UniverSlidesHistoryUIPlugin } from "@univerjs-pro/slides-history-ui";
import type { Plugin, PluginCtor, Univer } from "@univerjs/core";
import { UniverType } from "@univerjs/protocol";
import sheetFormulaWorkerUrl from "../units/sheet/worker?worker&url";

/** The history UI per Unit type. PDF has none, so a PDF page gets no history. */
const HISTORY_UI_PLUGINS: Partial<Record<number, PluginCtor<Plugin>>> = {
  [UniverType.UNIVER_SHEET]: UniverSheetsHistoryUIPlugin,
  [UniverType.UNIVER_DOC]: UniverDocsHistoryUIPlugin,
  [UniverType.UNIVER_SLIDE]: UniverSlidesHistoryUIPlugin,
  [UniverType.UNIVER_BASE]: UniverBasesHistoryUIPlugin,
  [UniverType.UNIVER_BOARD]: UniverBoardsHistoryUIPlugin,
};

export function registerHistory(univer: Univer, baseURL: string, container: string, unitType: number) {
  const ui = HISTORY_UI_PLUGINS[unitType];
  if (!ui) return;
  univer.registerPlugin(ui, {
    historyServerUrl: `${baseURL}/history`,
    univerContainerId: container,
    // The Sheet viewer renders each version in its own Univer and only calculates formulas through this Worker.
    ...(unitType === UniverType.UNIVER_SHEET ? { workerURL: sheetFormulaWorkerUrl } : {}),
  });
}
