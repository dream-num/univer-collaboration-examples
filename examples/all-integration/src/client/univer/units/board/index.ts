import { UniverBoardsPlugin } from "@univerjs-pro/boards";
import { UniverBoardsChartPlugin } from "@univerjs-pro/boards-chart";
import { UniverBoardsChartUIPlugin } from "@univerjs-pro/boards-chart-ui";
import { UniverBoardsMindPlugin } from "@univerjs-pro/boards-mind";
import { UniverBoardsMindUIPlugin } from "@univerjs-pro/boards-mind-ui";
import { UniverBoardsTablePlugin } from "@univerjs-pro/boards-table";
import { UniverBoardsTableUIPlugin } from "@univerjs-pro/boards-table-ui";
import { UniverBoardsUIPlugin } from "@univerjs-pro/boards-ui";
import { UniverDocsLatexPlugin } from "@univerjs-pro/docs-latex";
import { UniverDocsLatexUIPlugin } from "@univerjs-pro/docs-latex-ui";
import { UniverInkPlugin } from "@univerjs-pro/ink";
import { UniverInkUIPlugin } from "@univerjs-pro/ink-ui";
import type { Univer } from "@univerjs/core";
import { UniverDocsPlugin } from "@univerjs/docs";
import { UniverDocsUIPlugin } from "@univerjs/docs-ui";
import { UniverUIPlugin } from "@univerjs/ui";
import type { MountUniverEditorOptions } from "../../types";

import "@univerjs-pro/boards-chart/facade";
import "@univerjs-pro/boards-mind/facade";
import "@univerjs-pro/boards-table/facade";
import "@univerjs-pro/chart-ui/facade";
import "@univerjs-pro/docs-latex/facade";
import "@univerjs-pro/engine-chart/facade";
import "@univerjs-pro/ink/facade";

export function registerBoardUnit(
  univer: Univer,
  options: MountUniverEditorOptions,
) {
  univer.registerPlugin(UniverUIPlugin, {
    container: options.container,
    ribbonType: "grid",
    header: false,
    toolbar: false,
    footer: false,
  });
  univer.registerPlugin(UniverDocsPlugin);
  univer.registerPlugin(UniverDocsUIPlugin);
  univer.registerPlugin(UniverBoardsPlugin);
  univer.registerPlugin(UniverBoardsUIPlugin);

  univer.registerPlugin(UniverDocsLatexPlugin);
  univer.registerPlugin(UniverDocsLatexUIPlugin);
  univer.registerPlugin(UniverInkPlugin);
  univer.registerPlugin(UniverInkUIPlugin);
  univer.registerPlugin(UniverBoardsChartPlugin);
  univer.registerPlugin(UniverBoardsChartUIPlugin);
  univer.registerPlugin(UniverBoardsMindPlugin);
  univer.registerPlugin(UniverBoardsMindUIPlugin);
  univer.registerPlugin(UniverBoardsTablePlugin);
  univer.registerPlugin(UniverBoardsTableUIPlugin);
}
