import BasesDashboardUIEnUS from "@univerjs-pro/bases-dashboard-ui/locale/en-US";
import BasesDashboardUIZhCN from "@univerjs-pro/bases-dashboard-ui/locale/zh-CN";
import EngineFormulaEnUS from "@univerjs/engine-formula/locale/en-US";
import EngineFormulaZhCN from "@univerjs/engine-formula/locale/zh-CN";
import { mergeLocales } from "@univerjs/presets";

export const baseLocales = {
  enUS: mergeLocales(EngineFormulaEnUS, BasesDashboardUIEnUS),
  zhCN: mergeLocales(EngineFormulaZhCN, BasesDashboardUIZhCN),
};
