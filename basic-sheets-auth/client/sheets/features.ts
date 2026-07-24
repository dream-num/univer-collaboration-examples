import type { IPresetPlugin } from "@univerjs/presets";
import { IImageIoService } from "@univerjs/core";
import { UniverRangePreprocessPlugin } from "@univerjs-pro/range-preprocess";
import { UniverSheetsChartPlugin } from "@univerjs-pro/sheets-chart";
import SheetsChartEnUS from "@univerjs-pro/sheets-chart/locale/en-US";
import { UniverSheetsChartUIPlugin } from "@univerjs-pro/sheets-chart-ui";
import SheetsChartUIEnUS from "@univerjs-pro/sheets-chart-ui/locale/en-US";
import { UniverSheetsOutlinePlugin } from "@univerjs-pro/sheets-outline";
import { UniverSheetsOutlineUIPlugin } from "@univerjs-pro/sheets-outline-ui";
import SheetsOutlineUIEnUS from "@univerjs-pro/sheets-outline-ui/locale/en-US";
import { UniverSheetsPivotTablePlugin } from "@univerjs-pro/sheets-pivot";
import SheetsPivotEnUS from "@univerjs-pro/sheets-pivot/locale/en-US";
import { UniverSheetsPivotTableUIPlugin } from "@univerjs-pro/sheets-pivot-ui";
import SheetsPivotUIEnUS from "@univerjs-pro/sheets-pivot-ui/locale/en-US";
import { UniverSheetsShapePlugin } from "@univerjs-pro/sheets-shape";
import { UniverSheetsShapeUIPlugin } from "@univerjs-pro/sheets-shape-ui";
import SheetsShapeUIEnUS from "@univerjs-pro/sheets-shape-ui/locale/en-US";
import { UniverSheetSparklinePlugin } from "@univerjs-pro/sheets-sparkline";
import { UniverSheetSparklineUIPlugin } from "@univerjs-pro/sheets-sparkline-ui";
import SheetsSparklineUIEnUS from "@univerjs-pro/sheets-sparkline-ui/locale/en-US";
import { UniverDataValidationPlugin } from "@univerjs/data-validation";
import DataValidationEnUS from "@univerjs/data-validation/locale/en-US";
import { UniverDrawingPlugin } from "@univerjs/drawing";
import { UniverDrawingUIPlugin } from "@univerjs/drawing-ui";
import DrawingUIEnUS from "@univerjs/drawing-ui/locale/en-US";
import { UniverSheetsConditionalFormattingPlugin } from "@univerjs/sheets-conditional-formatting";
import { UniverSheetsConditionalFormattingUIPlugin } from "@univerjs/sheets-conditional-formatting-ui";
import ConditionalFormattingEnUS from "@univerjs/sheets-conditional-formatting/locale/en-US";
import ConditionalFormattingUIEnUS from "@univerjs/sheets-conditional-formatting-ui/locale/en-US";
import { UniverSheetsCrosshairHighlightPlugin } from "@univerjs/sheets-crosshair-highlight";
import CrosshairEnUS from "@univerjs/sheets-crosshair-highlight/locale/en-US";
import { UniverSheetsDataValidationPlugin } from "@univerjs/sheets-data-validation";
import SheetsDataValidationEnUS from "@univerjs/sheets-data-validation/locale/en-US";
import { UniverSheetsDataValidationUIPlugin } from "@univerjs/sheets-data-validation-ui";
import SheetsDataValidationUIEnUS from "@univerjs/sheets-data-validation-ui/locale/en-US";
import { UniverSheetsDrawingPlugin } from "@univerjs/sheets-drawing";
import { UniverSheetsDrawingUIPlugin } from "@univerjs/sheets-drawing-ui";
import SheetsDrawingUIEnUS from "@univerjs/sheets-drawing-ui/locale/en-US";
import { UniverSheetsFilterPlugin } from "@univerjs/sheets-filter";
import SheetsFilterEnUS from "@univerjs/sheets-filter/locale/en-US";
import { UniverSheetsFilterUIPlugin } from "@univerjs/sheets-filter-ui";
import SheetsFilterUIEnUS from "@univerjs/sheets-filter-ui/locale/en-US";
import { UniverSheetsFindReplacePlugin } from "@univerjs/sheets-find-replace";
import { UniverSheetsHyperLinkUIPlugin } from "@univerjs/sheets-hyper-link-ui";
import SheetsHyperLinkUIEnUS from "@univerjs/sheets-hyper-link-ui/locale/en-US";
import { UniverSheetsNotePlugin } from "@univerjs/sheets-note";
import { UniverSheetsNoteUIPlugin } from "@univerjs/sheets-note-ui";
import SheetsNoteUIEnUS from "@univerjs/sheets-note-ui/locale/en-US";
import { UniverSheetsSortPlugin } from "@univerjs/sheets-sort";
import { UniverSheetsSortUIPlugin } from "@univerjs/sheets-sort-ui";
import SheetsSortUIEnUS from "@univerjs/sheets-sort-ui/locale/en-US";
import { UniverSheetsTablePlugin } from "@univerjs/sheets-table";
import SheetsTableEnUS from "@univerjs/sheets-table/locale/en-US";
import { UniverSheetsTableUIPlugin } from "@univerjs/sheets-table-ui";
import SheetsTableUIEnUS from "@univerjs/sheets-table-ui/locale/en-US";
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
  DataValidationEnUS,
  DrawingUIEnUS,
  ConditionalFormattingEnUS,
  ConditionalFormattingUIEnUS,
  CrosshairEnUS,
  SheetsDataValidationEnUS,
  SheetsDataValidationUIEnUS,
  SheetsDrawingUIEnUS,
  SheetsFilterEnUS,
  SheetsFilterUIEnUS,
  SheetsHyperLinkUIEnUS,
  SheetsNoteUIEnUS,
  SheetsSortUIEnUS,
  SheetsTableEnUS,
  SheetsTableUIEnUS,
  SheetsChartEnUS,
  SheetsChartUIEnUS,
  SheetsOutlineUIEnUS,
  SheetsPivotEnUS,
  SheetsPivotUIEnUS,
  SheetsShapeUIEnUS,
  SheetsSparklineUIEnUS
);

/**
 * 与 Basic Sheets 使用同一组产品插件，但公式、Pivot 和 History 均留在主线程。
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
