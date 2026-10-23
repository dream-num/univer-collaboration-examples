import PdfsUIEnUS from "@univerjs-pro/pdfs-ui/locale/en-US";
import PdfsUIZhCN from "@univerjs-pro/pdfs-ui/locale/zh-CN";
import { mergeLocales } from "@univerjs/presets";

export const pdfLocales = {
  enUS: mergeLocales(PdfsUIEnUS),
  zhCN: mergeLocales(PdfsUIZhCN),
};
