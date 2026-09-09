import EngineFormulaEnUS from "@univerjs/engine-formula/locale/en-US";
import EngineFormulaZhCN from "@univerjs/engine-formula/locale/zh-CN";
import { mergeLocales } from "@univerjs/presets";

export const baseLocales = {
  enUS: mergeLocales(EngineFormulaEnUS),
  zhCN: mergeLocales(EngineFormulaZhCN),
};
