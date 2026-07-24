import type { Plugin, PluginCtor } from "@univerjs/core";
import { UniverSheetsPivotTableUIPlugin } from "@univerjs-pro/sheets-pivot-ui";
import { UniverSheetsConditionalFormattingUIPlugin } from "@univerjs/sheets-conditional-formatting-ui";
import { UniverSheetsCrosshairHighlightPlugin } from "@univerjs/sheets-crosshair-highlight";
import { UniverSheetsFilterUIPlugin } from "@univerjs/sheets-filter-ui";
import { UniverSheetsFindReplacePlugin } from "@univerjs/sheets-find-replace";
import { UniverSheetsHyperLinkUIPlugin } from "@univerjs/sheets-hyper-link-ui";
import { UniverSheetsNumfmtUIPlugin } from "@univerjs/sheets-numfmt-ui";
import { UniverSheetsSortUIPlugin } from "@univerjs/sheets-sort-ui";

/**
 * 与上游 sheets demo 的 lazy 分组一致，但基础示例在启动时立即注册，
 * 避免人为延时造成能力出现时间不确定。
 */
export default function getClientToolPlugins(): Array<
  [PluginCtor<Plugin>] | [PluginCtor<Plugin>, unknown]
> {
  return [
    [UniverSheetsCrosshairHighlightPlugin],
    [UniverSheetsFilterUIPlugin, { useRemoteFilterValuesGenerator: false }],
    [UniverSheetsFindReplacePlugin],
    [UniverSheetsSortUIPlugin],
    [UniverSheetsConditionalFormattingUIPlugin],
    [UniverSheetsPivotTableUIPlugin],
    [UniverSheetsHyperLinkUIPlugin],
    [UniverSheetsNumfmtUIPlugin],
  ];
}
