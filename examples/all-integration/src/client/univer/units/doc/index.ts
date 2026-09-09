import { UniverDocsCalloutPlugin } from "@univerjs-pro/docs-callout";
import { UniverDocsCalloutUIPlugin } from "@univerjs-pro/docs-callout-ui";
import { UniverDocsChartPlugin } from "@univerjs-pro/docs-chart";
import { UniverDocsChartUIPlugin } from "@univerjs-pro/docs-chart-ui";
import { UniverDocsCodePlugin } from "@univerjs-pro/docs-code";
import { UniverDocsCodeUIPlugin } from "@univerjs-pro/docs-code-ui";
import { UniverDocsLatexPlugin } from "@univerjs-pro/docs-latex";
import { UniverDocsLatexUIPlugin } from "@univerjs-pro/docs-latex-ui";
import { UniverDocsShapePlugin } from "@univerjs-pro/docs-shape";
import { UniverDocsShapeUIPlugin } from "@univerjs-pro/docs-shape-ui";
import { UniverDocsTablePlugin } from "@univerjs-pro/docs-table";
import { UniverDocsTableUIPlugin } from "@univerjs-pro/docs-table-ui";
import { UniverProFormulaEnginePlugin } from "@univerjs-pro/engine-formula";
import type { Univer } from "@univerjs/core";
import { UniverDocsPlugin } from "@univerjs/docs";
import { UniverDocsUIPlugin } from "@univerjs/docs-ui";
import { UniverNetworkPlugin } from "@univerjs/network";
import {
  UniverDocsDrawingPlugin,
  UniverDocsDrawingUIPlugin,
  UniverDrawingUIPlugin,
} from "@univerjs/preset-docs-drawing";
import {
  UniverDocsHyperLinkPlugin,
  UniverDocsHyperLinkUIPlugin,
} from "@univerjs/preset-docs-hyper-link";
import { UniverUIPlugin } from "@univerjs/ui";
import type { MountUniverEditorOptions } from "../../types";

import "@univerjs-pro/chart-ui/facade";
import "@univerjs-pro/docs-callout/facade";
import "@univerjs-pro/docs-chart/facade";
import "@univerjs-pro/docs-code/facade";
import "@univerjs-pro/docs-latex/facade";
import "@univerjs-pro/docs-shape/facade";
import "@univerjs-pro/docs-table/facade";
import "@univerjs-pro/engine-chart/facade";

export function registerDocUnit(
  univer: Univer,
  options: MountUniverEditorOptions,
) {
  univer.registerPlugin(UniverNetworkPlugin);
  univer.registerPlugin(UniverProFormulaEnginePlugin);
  univer.registerPlugin(UniverUIPlugin, {
    container: options.container,
    ribbonType: "grid",
  });
  univer.registerPlugin(UniverDocsPlugin);
  univer.registerPlugin(UniverDocsUIPlugin);

  univer.registerPlugin(UniverDrawingUIPlugin);
  univer.registerPlugin(UniverDocsDrawingPlugin);
  univer.registerPlugin(UniverDocsDrawingUIPlugin);
  univer.registerPlugin(UniverDocsHyperLinkPlugin);
  univer.registerPlugin(UniverDocsHyperLinkUIPlugin);
  univer.registerPlugin(UniverDocsCalloutPlugin);
  univer.registerPlugin(UniverDocsCalloutUIPlugin);
  univer.registerPlugin(UniverDocsChartPlugin);
  univer.registerPlugin(UniverDocsChartUIPlugin);
  univer.registerPlugin(UniverDocsCodePlugin);
  univer.registerPlugin(UniverDocsCodeUIPlugin);
  univer.registerPlugin(UniverDocsLatexPlugin);
  univer.registerPlugin(UniverDocsLatexUIPlugin);
  univer.registerPlugin(UniverDocsShapePlugin);
  univer.registerPlugin(UniverDocsShapeUIPlugin);
  univer.registerPlugin(UniverDocsTablePlugin);
  univer.registerPlugin(UniverDocsTableUIPlugin);
}
