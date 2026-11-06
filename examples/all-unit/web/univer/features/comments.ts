import { UniverBasesThreadCommentUIPlugin } from "@univerjs-pro/bases-thread-comment-ui";
import { UniverBoardsThreadCommentUIPlugin } from "@univerjs-pro/boards-thread-comment-ui";
import { UniverSlidesThreadCommentUIPlugin } from "@univerjs-pro/slides-thread-comment-ui";
import { UniverThreadCommentDataSourcePlugin } from "@univerjs-pro/thread-comment-datasource";
import type { Plugin, PluginCtor, Univer } from "@univerjs/core";
import { UniverDocsThreadCommentUIPlugin } from "@univerjs/docs-thread-comment-ui";
import { UniverType } from "@univerjs/protocol";
import { UniverSheetsThreadCommentUIPlugin } from "@univerjs/sheets-thread-comment-ui";

/** The comment UI per Unit type. PDF has none, so a PDF page gets no comments. */
const COMMENT_UI_PLUGINS: Partial<Record<number, PluginCtor<Plugin>>> = {
  [UniverType.UNIVER_SHEET]: UniverSheetsThreadCommentUIPlugin,
  [UniverType.UNIVER_DOC]: UniverDocsThreadCommentUIPlugin,
  [UniverType.UNIVER_SLIDE]: UniverSlidesThreadCommentUIPlugin,
  [UniverType.UNIVER_BASE]: UniverBasesThreadCommentUIPlugin,
  [UniverType.UNIVER_BOARD]: UniverBoardsThreadCommentUIPlugin,
};

export function registerComments(univer: Univer, unitType: number) {
  const ui = COMMENT_UI_PLUGINS[unitType];
  if (!ui) return;
  univer.registerPlugin(ui);
  // The data source reads and writes comments through the Comment Endpoint.
  univer.registerPlugin(UniverThreadCommentDataSourcePlugin);
}
