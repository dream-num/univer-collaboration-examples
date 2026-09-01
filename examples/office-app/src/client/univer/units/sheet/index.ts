import { UniverProFormulaEnginePlugin } from "@univerjs-pro/engine-formula";
import {
  UniverSheetsChartPlugin,
  UniverSheetsChartUIPlugin,
  UniverSheetsOutlinePlugin,
  UniverSheetsOutlineUIPlugin,
  UniverSheetsPivotTablePlugin,
  UniverSheetsPivotTableUIPlugin,
  UniverSheetsShapePlugin,
  UniverSheetsShapeUIPlugin,
  UniverSheetSparklinePlugin,
  UniverSheetSparklineUIPlugin,
} from "@univerjs/preset-sheets-advanced";
import {
  UniverSheetsConditionalFormattingPlugin,
  UniverSheetsConditionalFormattingUIPlugin,
} from "@univerjs/preset-sheets-conditional-formatting";
import {
  UniverDataValidationPlugin,
  UniverSheetsDataValidationPlugin,
  UniverSheetsDataValidationUIPlugin,
} from "@univerjs/preset-sheets-data-validation";
import {
  UniverDocsDrawingPlugin,
  UniverDrawingUIPlugin,
  UniverSheetsDrawingPlugin,
  UniverSheetsDrawingUIPlugin,
} from "@univerjs/preset-sheets-drawing";
import {
  UniverSheetsFilterPlugin,
  UniverSheetsFilterUIPlugin,
} from "@univerjs/preset-sheets-filter";
import {
  UniverFindReplacePlugin,
  UniverSheetsFindReplacePlugin,
} from "@univerjs/preset-sheets-find-replace";
import {
  UniverSheetsHyperLinkPlugin,
  UniverSheetsHyperLinkUIPlugin,
} from "@univerjs/preset-sheets-hyper-link";
import {
  UniverSheetsNotePlugin,
  UniverSheetsNoteUIPlugin,
} from "@univerjs/preset-sheets-note";
import {
  UniverSheetsSortPlugin,
  UniverSheetsSortUIPlugin,
} from "@univerjs/preset-sheets-sort";
import {
  UniverSheetsTablePlugin,
  UniverSheetsTableUIPlugin,
} from "@univerjs/preset-sheets-table";
import type { Univer } from "@univerjs/core";
import { UniverDocsPlugin } from "@univerjs/docs";
import { UniverDocsUIPlugin } from "@univerjs/docs-ui";
import { UniverNetworkPlugin } from "@univerjs/network";
import { UniverSheetsPlugin } from "@univerjs/sheets";
import { UniverSheetsFormulaPlugin } from "@univerjs/sheets-formula";
import { UniverSheetsFormulaUIPlugin } from "@univerjs/sheets-formula-ui";
import { UniverSheetsNumfmtPlugin } from "@univerjs/sheets-numfmt";
import { UniverSheetsNumfmtUIPlugin } from "@univerjs/sheets-numfmt-ui";
import { UniverSheetsUIPlugin } from "@univerjs/sheets-ui";
import { UniverUIPlugin } from "@univerjs/ui";
import type { MountUniverEditorOptions } from "../../types";

export function registerSheetUnit(
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
  univer.registerPlugin(UniverSheetsPlugin);
  univer.registerPlugin(UniverSheetsUIPlugin);
  univer.registerPlugin(UniverSheetsNumfmtPlugin);
  univer.registerPlugin(UniverSheetsNumfmtUIPlugin);
  univer.registerPlugin(UniverSheetsFormulaPlugin);
  univer.registerPlugin(UniverSheetsFormulaUIPlugin);

  univer.registerPlugin(UniverDocsDrawingPlugin);
  univer.registerPlugin(UniverDrawingUIPlugin);
  univer.registerPlugin(UniverSheetsDrawingPlugin);
  univer.registerPlugin(UniverSheetsDrawingUIPlugin);
  univer.registerPlugin(UniverSheetsConditionalFormattingPlugin);
  univer.registerPlugin(UniverSheetsConditionalFormattingUIPlugin);
  univer.registerPlugin(UniverSheetsFilterPlugin, { enableSyncSwitch: true });
  univer.registerPlugin(UniverSheetsFilterUIPlugin);
  univer.registerPlugin(UniverSheetsHyperLinkPlugin);
  univer.registerPlugin(UniverSheetsHyperLinkUIPlugin);
  univer.registerPlugin(UniverDataValidationPlugin);
  univer.registerPlugin(UniverSheetsDataValidationPlugin);
  univer.registerPlugin(UniverSheetsDataValidationUIPlugin);
  univer.registerPlugin(UniverFindReplacePlugin);
  univer.registerPlugin(UniverSheetsFindReplacePlugin);
  univer.registerPlugin(UniverSheetsNotePlugin);
  univer.registerPlugin(UniverSheetsNoteUIPlugin);
  univer.registerPlugin(UniverSheetsSortPlugin);
  univer.registerPlugin(UniverSheetsSortUIPlugin);
  univer.registerPlugin(UniverSheetsTablePlugin);
  univer.registerPlugin(UniverSheetsTableUIPlugin);
  univer.registerPlugin(UniverSheetsPivotTablePlugin);
  univer.registerPlugin(UniverSheetsPivotTableUIPlugin);
  univer.registerPlugin(UniverSheetsChartPlugin);
  univer.registerPlugin(UniverSheetsChartUIPlugin);
  univer.registerPlugin(UniverSheetsOutlinePlugin);
  univer.registerPlugin(UniverSheetsOutlineUIPlugin);
  univer.registerPlugin(UniverSheetsShapePlugin);
  univer.registerPlugin(UniverSheetsShapeUIPlugin);
  univer.registerPlugin(UniverSheetSparklinePlugin);
  univer.registerPlugin(UniverSheetSparklineUIPlugin);
}
