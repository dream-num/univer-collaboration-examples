import BasesDashboardUIEnUS from "@univerjs-pro/bases-dashboard-ui/locale/en-US";
import BasesDashboardUIZhCN from "@univerjs-pro/bases-dashboard-ui/locale/zh-CN";

/**
 * Workaround for @univerjs-pro/bases-history-ui
 * 1.0.0-insiders.20260831-796c4f4.
 *
 * Base History viewer 会注册 bases-dashboard-ui，但 History locale 没有聚合 Dashboard locale，
 * 导致界面直接显示 locale key。上游 History 包补齐传递 locale 后删除本文件及直接依赖。
 */
export const baseHistoryTransitiveLocales = {
  enUS: BasesDashboardUIEnUS,
  zhCN: BasesDashboardUIZhCN,
};
