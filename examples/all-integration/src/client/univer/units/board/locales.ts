import BoardsChartUIEnUS from "@univerjs-pro/boards-chart-ui/locale/en-US";
import BoardsChartUIZhCN from "@univerjs-pro/boards-chart-ui/locale/zh-CN";
import BoardsMindUIEnUS from "@univerjs-pro/boards-mind-ui/locale/en-US";
import BoardsMindUIZhCN from "@univerjs-pro/boards-mind-ui/locale/zh-CN";
import BoardsTableUIEnUS from "@univerjs-pro/boards-table-ui/locale/en-US";
import BoardsTableUIZhCN from "@univerjs-pro/boards-table-ui/locale/zh-CN";
import ChartUIEnUS from "@univerjs-pro/chart-ui/locale/en-US";
import ChartUIZhCN from "@univerjs-pro/chart-ui/locale/zh-CN";
import DocsLatexUIEnUS from "@univerjs-pro/docs-latex-ui/locale/en-US";
import DocsLatexUIZhCN from "@univerjs-pro/docs-latex-ui/locale/zh-CN";
import EngineChartEnUS from "@univerjs-pro/engine-chart/locale/en-US";
import EngineChartZhCN from "@univerjs-pro/engine-chart/locale/zh-CN";
import InkUIEnUS from "@univerjs-pro/ink-ui/locale/en-US";
import InkUIZhCN from "@univerjs-pro/ink-ui/locale/zh-CN";
import { mergeLocales } from "@univerjs/presets";

export const boardLocales = {
  enUS: mergeLocales(
    ChartUIEnUS,
    EngineChartEnUS,
    DocsLatexUIEnUS,
    InkUIEnUS,
    BoardsChartUIEnUS,
    BoardsMindUIEnUS,
    BoardsTableUIEnUS,
  ),
  zhCN: mergeLocales(
    ChartUIZhCN,
    EngineChartZhCN,
    DocsLatexUIZhCN,
    InkUIZhCN,
    BoardsChartUIZhCN,
    BoardsMindUIZhCN,
    BoardsTableUIZhCN,
  ),
};
