import { UniverBasesThreadCommentUIPlugin } from "@univerjs-pro/bases-thread-comment-ui";
import { UniverBoardsThreadCommentUIPlugin } from "@univerjs-pro/boards-thread-comment-ui";
import { UniverSlidesThreadCommentUIPlugin } from "@univerjs-pro/slides-thread-comment-ui";
import { UniverThreadCommentDataSourcePlugin } from "@univerjs-pro/thread-comment-datasource";
import type { Univer } from "@univerjs/core";
import { UniverDocsThreadCommentUIPlugin } from "@univerjs/docs-thread-comment-ui";
import { UniverType } from "@univerjs/protocol";
import { UniverSheetsThreadCommentUIPlugin } from "@univerjs/sheets-thread-comment-ui";

/** Each Unit type has its own comment UI. PDF has none, so a PDF page gets no comments. */
export function registerComments(univer: Univer, unitType: number) {
  if (unitType === UniverType.UNIVER_SHEET) {
    univer.registerPlugin(UniverSheetsThreadCommentUIPlugin);
  } else if (unitType === UniverType.UNIVER_DOC) {
    univer.registerPlugin(UniverDocsThreadCommentUIPlugin);
  } else if (unitType === UniverType.UNIVER_SLIDE) {
    univer.registerPlugin(UniverSlidesThreadCommentUIPlugin);
  } else if (unitType === UniverType.UNIVER_BASE) {
    univer.registerPlugin(UniverBasesThreadCommentUIPlugin);
  } else if (unitType === UniverType.UNIVER_BOARD) {
    univer.registerPlugin(UniverBoardsThreadCommentUIPlugin);
  } else {
    return;
  }
  // The data source reads and writes comments through the Comment Endpoint.
  univer.registerPlugin(UniverThreadCommentDataSourcePlugin);
}
