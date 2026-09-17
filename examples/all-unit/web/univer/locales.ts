import BasesEnUS from "@univerjs-pro/bases/locale/en-US";
import BasesZhCN from "@univerjs-pro/bases/locale/zh-CN";
import BasesUIEnUS from "@univerjs-pro/bases-ui/locale/en-US";
import BasesUIZhCN from "@univerjs-pro/bases-ui/locale/zh-CN";
import BoardsUIEnUS from "@univerjs-pro/boards-ui/locale/en-US";
import BoardsUIZhCN from "@univerjs-pro/boards-ui/locale/zh-CN";
import CollaborationEnUS from "@univerjs-pro/collaboration-client/locale/en-US";
import CollaborationZhCN from "@univerjs-pro/collaboration-client/locale/zh-CN";
import CollaborationUIEnUS from "@univerjs-pro/collaboration-client-ui/locale/en-US";
import CollaborationUIZhCN from "@univerjs-pro/collaboration-client-ui/locale/zh-CN";
import ShapeEditorUIEnUS from "@univerjs-pro/shape-editor-ui/locale/en-US";
import ShapeEditorUIZhCN from "@univerjs-pro/shape-editor-ui/locale/zh-CN";
import SlidesEnUS from "@univerjs-pro/slides/locale/en-US";
import SlidesZhCN from "@univerjs-pro/slides/locale/zh-CN";
import SlidesUIEnUS from "@univerjs-pro/slides-ui/locale/en-US";
import SlidesUIZhCN from "@univerjs-pro/slides-ui/locale/zh-CN";
import { LocaleType } from "@univerjs/core";
import DesignEnUS from "@univerjs/design/locale/en-US";
import DesignZhCN from "@univerjs/design/locale/zh-CN";
import DocsUIEnUS from "@univerjs/docs-ui/locale/en-US";
import DocsUIZhCN from "@univerjs/docs-ui/locale/zh-CN";
import DrawingUIEnUS from "@univerjs/drawing-ui/locale/en-US";
import DrawingUIZhCN from "@univerjs/drawing-ui/locale/zh-CN";
import SheetsNumfmtUIEnUS from "@univerjs/sheets-numfmt-ui/locale/en-US";
import SheetsNumfmtUIZhCN from "@univerjs/sheets-numfmt-ui/locale/zh-CN";
import SheetsEnUS from "@univerjs/sheets/locale/en-US";
import SheetsZhCN from "@univerjs/sheets/locale/zh-CN";
import SheetsUIEnUS from "@univerjs/sheets-ui/locale/en-US";
import SheetsUIZhCN from "@univerjs/sheets-ui/locale/zh-CN";
import { mergeLocales } from "@univerjs/presets";
import UIEnUS from "@univerjs/ui/locale/en-US";
import UIZhCN from "@univerjs/ui/locale/zh-CN";
import { baseLocales } from "./units/base/locales";
import { boardLocales } from "./units/board/locales";
import { docLocales } from "./units/doc/locales";
import { sheetLocales } from "./units/sheet/locales";
import { slideLocales } from "./units/slide/locales";

export const univerLocales = {
  [LocaleType.EN_US]: mergeLocales(
    DesignEnUS,
    UIEnUS,
    DocsUIEnUS,
    docLocales.enUS,
    DrawingUIEnUS,
    SheetsEnUS,
    SheetsUIEnUS,
    SheetsNumfmtUIEnUS,
    sheetLocales.enUS,
    SlidesEnUS,
    SlidesUIEnUS,
    slideLocales.enUS,
    ShapeEditorUIEnUS,
    BoardsUIEnUS,
    boardLocales.enUS,
    BasesEnUS,
    baseLocales.enUS,
    BasesUIEnUS,
    CollaborationEnUS,
    CollaborationUIEnUS,
  ),
  [LocaleType.ZH_CN]: mergeLocales(
    DesignZhCN,
    UIZhCN,
    DocsUIZhCN,
    docLocales.zhCN,
    DrawingUIZhCN,
    SheetsZhCN,
    SheetsUIZhCN,
    SheetsNumfmtUIZhCN,
    sheetLocales.zhCN,
    SlidesZhCN,
    SlidesUIZhCN,
    slideLocales.zhCN,
    ShapeEditorUIZhCN,
    BoardsUIZhCN,
    boardLocales.zhCN,
    BasesZhCN,
    baseLocales.zhCN,
    BasesUIZhCN,
    CollaborationZhCN,
    CollaborationUIZhCN,
  ),
};
