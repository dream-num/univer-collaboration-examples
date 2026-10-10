import SlidesChartUIEnUS from "@univerjs-pro/slides-chart-ui/locale/en-US";
import SlidesChartUIZhCN from "@univerjs-pro/slides-chart-ui/locale/zh-CN";
import SlidesTableUIEnUS from "@univerjs-pro/slides-table-ui/locale/en-US";
import SlidesTableUIZhCN from "@univerjs-pro/slides-table-ui/locale/zh-CN";
import { mergeLocales } from "@univerjs/presets";

export const slideLocales = {
  enUS: mergeLocales(SlidesChartUIEnUS, SlidesTableUIEnUS),
  zhCN: mergeLocales(SlidesChartUIZhCN, SlidesTableUIZhCN),
};
