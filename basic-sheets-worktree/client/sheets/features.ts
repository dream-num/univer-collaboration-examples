import type { IPresetPlugin } from "@univerjs/presets";
import { IImageIoService } from "@univerjs/core";
import { UniverRangePreprocessPlugin } from "@univerjs-pro/range-preprocess";
import { UniverSheetsChartPlugin } from "@univerjs-pro/sheets-chart";
import SheetsChartZhCN from "@univerjs-pro/sheets-chart/locale/zh-CN";
import { UniverSheetsChartUIPlugin } from "@univerjs-pro/sheets-chart-ui";
import SheetsChartUIZhCN from "@univerjs-pro/sheets-chart-ui/locale/zh-CN";
import { UniverSheetsOutlinePlugin } from "@univerjs-pro/sheets-outline";
import { UniverSheetsOutlineUIPlugin } from "@univerjs-pro/sheets-outline-ui";
import SheetsOutlineUIZhCN from "@univerjs-pro/sheets-outline-ui/locale/zh-CN";
import { UniverSheetsPivotTablePlugin } from "@univerjs-pro/sheets-pivot";
import SheetsPivotZhCN from "@univerjs-pro/sheets-pivot/locale/zh-CN";
import { UniverSheetsPivotTableUIPlugin } from "@univerjs-pro/sheets-pivot-ui";
import SheetsPivotUIZhCN from "@univerjs-pro/sheets-pivot-ui/locale/zh-CN";
import { UniverSheetsShapePlugin } from "@univerjs-pro/sheets-shape";
import { UniverSheetsShapeUIPlugin } from "@univerjs-pro/sheets-shape-ui";
import SheetsShapeUIZhCN from "@univerjs-pro/sheets-shape-ui/locale/zh-CN";
import { UniverSheetSparklinePlugin } from "@univerjs-pro/sheets-sparkline";
import { UniverSheetSparklineUIPlugin } from "@univerjs-pro/sheets-sparkline-ui";
import SheetsSparklineUIZhCN from "@univerjs-pro/sheets-sparkline-ui/locale/zh-CN";
import { UniverDataValidationPlugin } from "@univerjs/data-validation";
import DataValidationZhCN from "@univerjs/data-validation/locale/zh-CN";
import { UniverDrawingPlugin } from "@univerjs/drawing";
import { UniverDrawingUIPlugin } from "@univerjs/drawing-ui";
import DrawingUIZhCN from "@univerjs/drawing-ui/locale/zh-CN";
import { UniverSheetsConditionalFormattingPlugin } from "@univerjs/sheets-conditional-formatting";
import { UniverSheetsConditionalFormattingUIPlugin } from "@univerjs/sheets-conditional-formatting-ui";
import ConditionalFormattingZhCN from "@univerjs/sheets-conditional-formatting/locale/zh-CN";
import ConditionalFormattingUIZhCN from "@univerjs/sheets-conditional-formatting-ui/locale/zh-CN";
import { UniverSheetsCrosshairHighlightPlugin } from "@univerjs/sheets-crosshair-highlight";
import CrosshairZhCN from "@univerjs/sheets-crosshair-highlight/locale/zh-CN";
import { UniverSheetsDataValidationPlugin } from "@univerjs/sheets-data-validation";
import SheetsDataValidationZhCN from "@univerjs/sheets-data-validation/locale/zh-CN";
import { UniverSheetsDataValidationUIPlugin } from "@univerjs/sheets-data-validation-ui";
import SheetsDataValidationUIZhCN from "@univerjs/sheets-data-validation-ui/locale/zh-CN";
import { UniverSheetsDrawingPlugin } from "@univerjs/sheets-drawing";
import { UniverSheetsDrawingUIPlugin } from "@univerjs/sheets-drawing-ui";
import SheetsDrawingUIZhCN from "@univerjs/sheets-drawing-ui/locale/zh-CN";
import { UniverSheetsFilterPlugin } from "@univerjs/sheets-filter";
import SheetsFilterZhCN from "@univerjs/sheets-filter/locale/zh-CN";
import { UniverSheetsFilterUIPlugin } from "@univerjs/sheets-filter-ui";
import SheetsFilterUIZhCN from "@univerjs/sheets-filter-ui/locale/zh-CN";
import { UniverSheetsFindReplacePlugin } from "@univerjs/sheets-find-replace";
import { UniverSheetsHyperLinkUIPlugin } from "@univerjs/sheets-hyper-link-ui";
import SheetsHyperLinkUIZhCN from "@univerjs/sheets-hyper-link-ui/locale/zh-CN";
import { UniverSheetsNotePlugin } from "@univerjs/sheets-note";
import { UniverSheetsNoteUIPlugin } from "@univerjs/sheets-note-ui";
import SheetsNoteUIZhCN from "@univerjs/sheets-note-ui/locale/zh-CN";
import { UniverSheetsSortPlugin } from "@univerjs/sheets-sort";
import { UniverSheetsSortUIPlugin } from "@univerjs/sheets-sort-ui";
import SheetsSortUIZhCN from "@univerjs/sheets-sort-ui/locale/zh-CN";
import { UniverSheetsTablePlugin } from "@univerjs/sheets-table";
import SheetsTableZhCN from "@univerjs/sheets-table/locale/zh-CN";
import { UniverSheetsTableUIPlugin } from "@univerjs/sheets-table-ui";
import SheetsTableUIZhCN from "@univerjs/sheets-table-ui/locale/zh-CN";
import { mergeLocales } from "@univerjs/presets";

import "@univerjs-pro/sheets-chart-ui/lib/index.css";
import "@univerjs-pro/sheets-outline-ui/lib/index.css";
import "@univerjs-pro/sheets-pivot-ui/lib/index.css";
import "@univerjs-pro/sheets-shape-ui/lib/index.css";
import "@univerjs-pro/sheets-sparkline-ui/lib/index.css";
import "@univerjs/drawing-ui/lib/index.css";
import "@univerjs/sheets-conditional-formatting-ui/lib/index.css";
import "@univerjs/sheets-crosshair-highlight/lib/index.css";
import "@univerjs/sheets-data-validation-ui/lib/index.css";
import "@univerjs/sheets-drawing-ui/lib/index.css";
import "@univerjs/sheets-filter-ui/lib/index.css";
import "@univerjs/sheets-hyper-link-ui/lib/index.css";
import "@univerjs/sheets-note-ui/lib/index.css";
import "@univerjs/sheets-sort-ui/lib/index.css";
import "@univerjs/sheets-table-ui/lib/index.css";

import "@univerjs/sheets-data-validation/facade";
import "@univerjs-pro/sheets-pivot/facade";
import "@univerjs-pro/sheets-chart/facade";
import "@univerjs-pro/sheets-shape/facade";
import "@univerjs-pro/sheets-sparkline/facade";
import "@univerjs-pro/sheets-outline/facade";
import "@univerjs/sheets-table/facade";
import "@univerjs-pro/range-preprocess/facade";

export const sheetFeatureLocale = mergeLocales(
  DataValidationZhCN,
  DrawingUIZhCN,
  ConditionalFormattingZhCN,
  ConditionalFormattingUIZhCN,
  CrosshairZhCN,
  SheetsDataValidationZhCN,
  SheetsDataValidationUIZhCN,
  SheetsDrawingUIZhCN,
  SheetsFilterZhCN,
  SheetsFilterUIZhCN,
  SheetsHyperLinkUIZhCN,
  SheetsNoteUIZhCN,
  SheetsSortUIZhCN,
  SheetsTableZhCN,
  SheetsTableUIZhCN,
  SheetsChartZhCN,
  SheetsChartUIZhCN,
  SheetsOutlineUIZhCN,
  SheetsPivotZhCN,
  SheetsPivotUIZhCN,
  SheetsShapeUIZhCN,
  SheetsSparklineUIZhCN
);

/**
 * Worktree viewer 会频繁重建 Univer；这里保留主线程执行，避免额外 Worker 生命周期。
 */
export function getSheetFeaturePlugins(): IPresetPlugin[] {
  return [
    [
      UniverDrawingPlugin,
      {
        override: [[IImageIoService, null]],
      },
    ],
    UniverRangePreprocessPlugin,
    UniverSheetsOutlinePlugin,
    UniverSheetsOutlineUIPlugin,
    UniverSheetsConditionalFormattingPlugin,
    UniverDataValidationPlugin,
    UniverSheetsDataValidationPlugin,
    UniverSheetsDataValidationUIPlugin,
    UniverSheetsFilterPlugin,
    UniverDrawingUIPlugin,
    UniverSheetsDrawingPlugin,
    UniverSheetsDrawingUIPlugin,
    UniverSheetsSortPlugin,
    [UniverSheetsPivotTablePlugin, { notExecuteFormula: false }],
    UniverSheetsChartPlugin,
    [UniverSheetsChartUIPlugin, { enableChartElementFloatMenu: true }],
    UniverSheetSparklinePlugin,
    UniverSheetSparklineUIPlugin,
    UniverSheetsTablePlugin,
    UniverSheetsTableUIPlugin,
    UniverSheetsShapePlugin,
    UniverSheetsShapeUIPlugin,
    UniverSheetsNotePlugin,
    UniverSheetsNoteUIPlugin,
    UniverSheetsCrosshairHighlightPlugin,
    [UniverSheetsFilterUIPlugin, { useRemoteFilterValuesGenerator: false }],
    UniverSheetsFindReplacePlugin,
    UniverSheetsSortUIPlugin,
    UniverSheetsConditionalFormattingUIPlugin,
    UniverSheetsPivotTableUIPlugin,
    UniverSheetsHyperLinkUIPlugin,
  ];
}
