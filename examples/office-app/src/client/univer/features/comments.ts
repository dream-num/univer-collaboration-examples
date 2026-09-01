import { UniverBasesThreadCommentUIPlugin } from "@univerjs-pro/bases-thread-comment-ui";
import { UniverBoardsThreadCommentUIPlugin } from "@univerjs-pro/boards-thread-comment-ui";
import { UniverThreadCommentDataSourcePlugin } from "@univerjs-pro/thread-comment-datasource";
import { UniverThreadCommentResourcePlugin } from "@univerjs-pro/thread-comment-resource";
import { UniverSlidesThreadCommentUIPlugin } from "@univerjs-pro/slides-thread-comment-ui";
import type { Univer } from "@univerjs/core";
import { UniverDocsThreadCommentUIPlugin } from "@univerjs/docs-thread-comment-ui";
import { UniverType } from "@univerjs/protocol";
import { UniverSheetsThreadCommentUIPlugin } from "@univerjs/sheets-thread-comment-ui";
import { installBaseCommentToolbarWorkaround } from "../../../workarounds/client/base-comment-toolbar";

export function registerComments(univer: Univer, unitType: number) {
  univer.registerPlugin(UniverThreadCommentResourcePlugin);
  univer.registerPlugin(UniverThreadCommentDataSourcePlugin);

  if (unitType === UniverType.UNIVER_SHEET) {
    univer.registerPlugin(UniverSheetsThreadCommentUIPlugin);
  } else if (unitType === UniverType.UNIVER_DOC) {
    univer.registerPlugin(UniverDocsThreadCommentUIPlugin);
  } else if (unitType === UniverType.UNIVER_SLIDE) {
    univer.registerPlugin(UniverSlidesThreadCommentUIPlugin);
  } else if (unitType === UniverType.UNIVER_BOARD) {
    univer.registerPlugin(UniverBoardsThreadCommentUIPlugin);
  } else if (unitType === UniverType.UNIVER_BASE) {
    univer.registerPlugin(UniverBasesThreadCommentUIPlugin);
    return installBaseCommentToolbarWorkaround(univer);
  }
}
