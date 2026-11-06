import { UniverBoardsPrintPlugin } from "@univerjs-pro/boards-print";
import { UniverDocsPrintPlugin } from "@univerjs-pro/docs-print";
import { UniverPdfsPrintPlugin } from "@univerjs-pro/pdfs-print";
import { UniverSheetsPrintPlugin } from "@univerjs-pro/sheets-print";
import { UniverSlidesPrintPlugin } from "@univerjs-pro/slides-print";
import type { Plugin, PluginCtor, Univer } from "@univerjs/core";
import { UniverType } from "@univerjs/protocol";

import "@univerjs-pro/sheets-print/facade";
import "@univerjs-pro/slides-print/facade";

/** The print plugin per Unit type. Base has none, so a Base page gets no print. */
const PRINT_PLUGINS: Partial<Record<number, PluginCtor<Plugin>>> = {
  [UniverType.UNIVER_SHEET]: UniverSheetsPrintPlugin,
  [UniverType.UNIVER_DOC]: UniverDocsPrintPlugin,
  [UniverType.UNIVER_SLIDE]: UniverSlidesPrintPlugin,
  [UniverType.UNIVER_BOARD]: UniverBoardsPrintPlugin,
  [UniverType.UNIVER_PDF]: UniverPdfsPrintPlugin,
};

export function registerPrint(univer: Univer, unitType: number) {
  const plugin = PRINT_PLUGINS[unitType];
  if (plugin) univer.registerPlugin(plugin);
}
