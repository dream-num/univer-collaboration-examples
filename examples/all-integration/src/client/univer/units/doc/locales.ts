import ChartUIEnUS from "@univerjs-pro/chart-ui/locale/en-US";
import ChartUIZhCN from "@univerjs-pro/chart-ui/locale/zh-CN";
import DocsCalloutUIEnUS from "@univerjs-pro/docs-callout-ui/locale/en-US";
import DocsCalloutUIZhCN from "@univerjs-pro/docs-callout-ui/locale/zh-CN";
import DocsChartUIEnUS from "@univerjs-pro/docs-chart-ui/locale/en-US";
import DocsChartUIZhCN from "@univerjs-pro/docs-chart-ui/locale/zh-CN";
import DocsCodeUIEnUS from "@univerjs-pro/docs-code-ui/locale/en-US";
import DocsCodeUIZhCN from "@univerjs-pro/docs-code-ui/locale/zh-CN";
import DocsLatexUIEnUS from "@univerjs-pro/docs-latex-ui/locale/en-US";
import DocsLatexUIZhCN from "@univerjs-pro/docs-latex-ui/locale/zh-CN";
import DocsShapeUIEnUS from "@univerjs-pro/docs-shape-ui/locale/en-US";
import DocsShapeUIZhCN from "@univerjs-pro/docs-shape-ui/locale/zh-CN";
import DocsTableUIEnUS from "@univerjs-pro/docs-table-ui/locale/en-US";
import DocsTableUIZhCN from "@univerjs-pro/docs-table-ui/locale/zh-CN";
import EngineChartEnUS from "@univerjs-pro/engine-chart/locale/en-US";
import EngineChartZhCN from "@univerjs-pro/engine-chart/locale/zh-CN";
import EngineFormulaEnUS from "@univerjs/engine-formula/locale/en-US";
import EngineFormulaZhCN from "@univerjs/engine-formula/locale/zh-CN";
import DocsDrawingEnUS from "@univerjs/preset-docs-drawing/locales/en-US";
import DocsDrawingZhCN from "@univerjs/preset-docs-drawing/locales/zh-CN";
import DocsHyperLinkEnUS from "@univerjs/preset-docs-hyper-link/locales/en-US";
import DocsHyperLinkZhCN from "@univerjs/preset-docs-hyper-link/locales/zh-CN";
import { mergeLocales } from "@univerjs/presets";

export const docLocales = {
  enUS: mergeLocales(
    ChartUIEnUS,
    EngineChartEnUS,
    EngineFormulaEnUS,
    DocsDrawingEnUS,
    DocsHyperLinkEnUS,
    DocsCalloutUIEnUS,
    DocsChartUIEnUS,
    DocsCodeUIEnUS,
    DocsLatexUIEnUS,
    DocsShapeUIEnUS,
    DocsTableUIEnUS,
  ),
  zhCN: mergeLocales(
    ChartUIZhCN,
    EngineChartZhCN,
    EngineFormulaZhCN,
    DocsDrawingZhCN,
    DocsHyperLinkZhCN,
    DocsCalloutUIZhCN,
    DocsChartUIZhCN,
    DocsCodeUIZhCN,
    DocsLatexUIZhCN,
    DocsShapeUIZhCN,
    DocsTableUIZhCN,
  ),
};
