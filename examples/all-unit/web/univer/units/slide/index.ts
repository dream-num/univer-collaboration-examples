import { UniverSlidesChartPlugin } from "@univerjs-pro/slides-chart";
import { UniverSlidesChartUIPlugin } from "@univerjs-pro/slides-chart-ui";
import { UniverSlidesTablePlugin } from "@univerjs-pro/slides-table";
import { UniverSlidesTableUIPlugin } from "@univerjs-pro/slides-table-ui";
import { UniverSlidesPlugin } from "@univerjs-pro/slides";
import { UniverSlidesUIPlugin } from "@univerjs-pro/slides-ui";
import type { Univer } from "@univerjs/core";
import { UniverDocsPlugin } from "@univerjs/docs";
import { UniverDocsUIPlugin } from "@univerjs/docs-ui";
import { UniverUIPlugin } from "@univerjs/ui";
import { UniverExchangeClientPlugin } from "@univerjs-pro/exchange-client";
import { UniverSlidesExchangeClientPlugin } from "@univerjs-pro/slides-exchange-client";
import { UniverSlidesHistoryUIPlugin } from "@univerjs-pro/slides-history-ui";
import { UniverSlidesPrintPlugin } from "@univerjs-pro/slides-print";
import { UniverSlidesThreadCommentUIPlugin } from "@univerjs-pro/slides-thread-comment-ui";
import { UniverThreadCommentDataSourcePlugin } from "@univerjs-pro/thread-comment-datasource";
import type { MountUniverEditorOptions } from "../../types";
import { registerCollaborationClient } from "../../collaboration";
import { exchangeClientConfig, historyConfig } from "../../config";
import { CustomSlidesImportExportPlugin } from "../../import-export/slides/plugin";

import "@univerjs-pro/engine-chart/facade";
import "@univerjs-pro/slides-chart/facade";
import "@univerjs-pro/slides-table/facade";
import "@univerjs-pro/exchange-client/facade";
import "@univerjs-pro/slides-exchange-client/facade";
import "@univerjs-pro/slides-print/facade";

export function registerSlideUnit(
  univer: Univer,
  options: MountUniverEditorOptions,
) {
  univer.registerPlugin(UniverUIPlugin, {
    container: options.container,
    ribbonType: "grid",
  });
  univer.registerPlugin(UniverDocsPlugin);
  univer.registerPlugin(UniverDocsUIPlugin);
  univer.registerPlugin(UniverSlidesPlugin);
  univer.registerPlugin(UniverSlidesUIPlugin);

  univer.registerPlugin(UniverSlidesChartPlugin);
  univer.registerPlugin(UniverSlidesChartUIPlugin);
  univer.registerPlugin(UniverSlidesTablePlugin);
  univer.registerPlugin(UniverSlidesTableUIPlugin);

  // comment
  univer.registerPlugin(UniverSlidesThreadCommentUIPlugin);

  // collaboration
  registerCollaborationClient(univer);
  univer.registerPlugin(UniverThreadCommentDataSourcePlugin);

  // history
  univer.registerPlugin(UniverSlidesHistoryUIPlugin, historyConfig(options.container));

  // print
  univer.registerPlugin(UniverSlidesPrintPlugin);

  // exchange
  univer.registerPlugin(UniverExchangeClientPlugin, exchangeClientConfig);
  univer.registerPlugin(UniverSlidesExchangeClientPlugin);
  univer.registerPlugin(CustomSlidesImportExportPlugin);
}
