import BasesDashboardUIEnUS from "@univerjs-pro/bases-dashboard-ui/locale/en-US";
import BasesDashboardUIZhCN from "@univerjs-pro/bases-dashboard-ui/locale/zh-CN";
import { UniverBasesHistoryUIPlugin } from "@univerjs-pro/bases-history-ui";
import BasesHistoryUIEnUS from "@univerjs-pro/bases-history-ui/locale/en-US";
import BasesHistoryUIZhCN from "@univerjs-pro/bases-history-ui/locale/zh-CN";
import { UniverBoardsHistoryUIPlugin } from "@univerjs-pro/boards-history-ui";
import BoardsHistoryUIEnUS from "@univerjs-pro/boards-history-ui/locale/en-US";
import BoardsHistoryUIZhCN from "@univerjs-pro/boards-history-ui/locale/zh-CN";
import { UniverDocsHistoryUIPlugin } from "@univerjs-pro/docs-history-ui";
import DocsHistoryUIEnUS from "@univerjs-pro/docs-history-ui/locale/en-US";
import DocsHistoryUIZhCN from "@univerjs-pro/docs-history-ui/locale/zh-CN";
import EditHistoryUIEnUS from "@univerjs-pro/edit-history-ui/locale/en-US";
import EditHistoryUIZhCN from "@univerjs-pro/edit-history-ui/locale/zh-CN";
import { UniverSheetsHistoryUIPlugin } from "@univerjs-pro/sheets-history-ui";
import SheetsHistoryUIEnUS from "@univerjs-pro/sheets-history-ui/locale/en-US";
import SheetsHistoryUIZhCN from "@univerjs-pro/sheets-history-ui/locale/zh-CN";
import { UniverSlidesHistoryUIPlugin } from "@univerjs-pro/slides-history-ui";
import SlidesHistoryUIEnUS from "@univerjs-pro/slides-history-ui/locale/en-US";
import SlidesHistoryUIZhCN from "@univerjs-pro/slides-history-ui/locale/zh-CN";
import type { Univer } from "@univerjs/core";
import { mergeLocales } from "@univerjs/presets";
import { UniverType } from "@univerjs/protocol";
import { UniverThreadCommentPlugin } from "@univerjs/thread-comment";

export const historyLocales = {
  enUS: mergeLocales(
    EditHistoryUIEnUS,
    DocsHistoryUIEnUS,
    SheetsHistoryUIEnUS,
    SlidesHistoryUIEnUS,
    BoardsHistoryUIEnUS,
    BasesHistoryUIEnUS,
    BasesDashboardUIEnUS,
  ),
  zhCN: mergeLocales(
    EditHistoryUIZhCN,
    DocsHistoryUIZhCN,
    SheetsHistoryUIZhCN,
    SlidesHistoryUIZhCN,
    BoardsHistoryUIZhCN,
    BasesHistoryUIZhCN,
    BasesDashboardUIZhCN,
  ),
};

export function registerHistory(
  univer: Univer,
  unitType: number,
  historyServerUrl: string,
  univerContainerId: string,
) {
  if (unitType === UniverType.UNIVER_DOC) {
    univer.registerPlugin(UniverDocsHistoryUIPlugin, {
      historyServerUrl,
      univerContainerId,
      viewerPlugins: [[UniverThreadCommentPlugin]],
    });
  } else if (unitType === UniverType.UNIVER_SHEET) {
    univer.registerPlugin(UniverSheetsHistoryUIPlugin, {
      historyServerUrl,
      univerContainerId,
    });
  } else if (unitType === UniverType.UNIVER_SLIDE) {
    univer.registerPlugin(UniverSlidesHistoryUIPlugin, {
      historyServerUrl,
      univerContainerId,
      viewerPlugins: [[UniverThreadCommentPlugin]],
    });
  } else if (unitType === UniverType.UNIVER_BOARD) {
    univer.registerPlugin(UniverBoardsHistoryUIPlugin, {
      historyServerUrl,
      univerContainerId,
      viewerPlugins: [[UniverThreadCommentPlugin]],
    });
  } else if (unitType === UniverType.UNIVER_BASE) {
    univer.registerPlugin(UniverBasesHistoryUIPlugin, {
      historyServerUrl,
      univerContainerId,
      viewerPlugins: [[UniverThreadCommentPlugin]],
    });
  }
}
