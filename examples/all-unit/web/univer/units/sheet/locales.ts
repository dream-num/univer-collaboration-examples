import SheetsAdvancedEnUS from "@univerjs/preset-sheets-advanced/locales/en-US";
import SheetsAdvancedZhCN from "@univerjs/preset-sheets-advanced/locales/zh-CN";
import SheetsConditionalFormattingEnUS from "@univerjs/preset-sheets-conditional-formatting/locales/en-US";
import SheetsConditionalFormattingZhCN from "@univerjs/preset-sheets-conditional-formatting/locales/zh-CN";
import SheetsCoreEnUS from "@univerjs/preset-sheets-core/locales/en-US";
import SheetsCoreZhCN from "@univerjs/preset-sheets-core/locales/zh-CN";
import SheetsDataValidationEnUS from "@univerjs/preset-sheets-data-validation/locales/en-US";
import SheetsDataValidationZhCN from "@univerjs/preset-sheets-data-validation/locales/zh-CN";
import SheetsDrawingEnUS from "@univerjs/preset-sheets-drawing/locales/en-US";
import SheetsDrawingZhCN from "@univerjs/preset-sheets-drawing/locales/zh-CN";
import SheetsFilterEnUS from "@univerjs/preset-sheets-filter/locales/en-US";
import SheetsFilterZhCN from "@univerjs/preset-sheets-filter/locales/zh-CN";
import SheetsFindReplaceEnUS from "@univerjs/preset-sheets-find-replace/locales/en-US";
import SheetsFindReplaceZhCN from "@univerjs/preset-sheets-find-replace/locales/zh-CN";
import SheetsHyperLinkEnUS from "@univerjs/preset-sheets-hyper-link/locales/en-US";
import SheetsHyperLinkZhCN from "@univerjs/preset-sheets-hyper-link/locales/zh-CN";
import SheetsNoteEnUS from "@univerjs/preset-sheets-note/locales/en-US";
import SheetsNoteZhCN from "@univerjs/preset-sheets-note/locales/zh-CN";
import SheetsSortEnUS from "@univerjs/preset-sheets-sort/locales/en-US";
import SheetsSortZhCN from "@univerjs/preset-sheets-sort/locales/zh-CN";
import SheetsTableEnUS from "@univerjs/preset-sheets-table/locales/en-US";
import SheetsTableZhCN from "@univerjs/preset-sheets-table/locales/zh-CN";
import { mergeLocales } from "@univerjs/presets";

export const sheetLocales = {
  enUS: mergeLocales(
    SheetsCoreEnUS,
    SheetsDrawingEnUS,
    SheetsConditionalFormattingEnUS,
    SheetsFilterEnUS,
    SheetsHyperLinkEnUS,
    SheetsDataValidationEnUS,
    SheetsFindReplaceEnUS,
    SheetsNoteEnUS,
    SheetsSortEnUS,
    SheetsTableEnUS,
    SheetsAdvancedEnUS,
  ),
  zhCN: mergeLocales(
    SheetsCoreZhCN,
    SheetsDrawingZhCN,
    SheetsConditionalFormattingZhCN,
    SheetsFilterZhCN,
    SheetsHyperLinkZhCN,
    SheetsDataValidationZhCN,
    SheetsFindReplaceZhCN,
    SheetsNoteZhCN,
    SheetsSortZhCN,
    SheetsTableZhCN,
    SheetsAdvancedZhCN,
  ),
};
