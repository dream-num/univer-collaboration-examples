import { UniverBoardsPrintPlugin } from "@univerjs-pro/boards-print";
import { UniverDocsPrintPlugin } from "@univerjs-pro/docs-print";
import { UniverPdfsPrintPlugin } from "@univerjs-pro/pdfs-print";
import { UniverSheetsPrintPlugin } from "@univerjs-pro/sheets-print";
import { UniverSlidesPrintPlugin } from "@univerjs-pro/slides-print";
import type { Univer } from "@univerjs/core";
import { UniverType } from "@univerjs/protocol";

import "@univerjs-pro/sheets-print/facade";
import "@univerjs-pro/slides-print/facade";

/** Each Unit type has its own print plugin. Base has none, so a Base page gets no print. */
export function registerPrint(univer: Univer, unitType: number) {
  if (unitType === UniverType.UNIVER_SHEET) {
    univer.registerPlugin(UniverSheetsPrintPlugin);
  } else if (unitType === UniverType.UNIVER_DOC) {
    univer.registerPlugin(UniverDocsPrintPlugin);
  } else if (unitType === UniverType.UNIVER_SLIDE) {
    univer.registerPlugin(UniverSlidesPrintPlugin);
  } else if (unitType === UniverType.UNIVER_BOARD) {
    univer.registerPlugin(UniverBoardsPrintPlugin);
  } else if (unitType === UniverType.UNIVER_PDF) {
    univer.registerPlugin(UniverPdfsPrintPlugin);
  }
}
