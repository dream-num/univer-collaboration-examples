import type { IPresetPlugin } from "@univerjs/presets";
import { IImageIoService } from "@univerjs/core";
import { UniverDocsCalloutPlugin } from "@univerjs-pro/docs-callout";
import { UniverDocsCalloutUIPlugin } from "@univerjs-pro/docs-callout-ui";
import DocsCalloutUIEnUS from "@univerjs-pro/docs-callout-ui/locale/en-US";
import { UniverDocsChartPlugin } from "@univerjs-pro/docs-chart";
import { UniverDocsChartUIPlugin } from "@univerjs-pro/docs-chart-ui";
import DocsChartUIEnUS from "@univerjs-pro/docs-chart-ui/locale/en-US";
import { UniverDocsCodePlugin } from "@univerjs-pro/docs-code";
import { UniverDocsCodeUIPlugin } from "@univerjs-pro/docs-code-ui";
import DocsCodeUIEnUS from "@univerjs-pro/docs-code-ui/locale/en-US";
import { UniverDocsColumnPlugin } from "@univerjs-pro/docs-column";
import { UniverDocsColumnUIPlugin } from "@univerjs-pro/docs-column-ui";
import DocsColumnUIEnUS from "@univerjs-pro/docs-column-ui/locale/en-US";
import { UniverDocsExchangeClientPlugin } from "@univerjs-pro/docs-exchange-client";
import DocsExchangeClientEnUS from "@univerjs-pro/docs-exchange-client/locale/en-US";
import { UniverDocsLatexPlugin } from "@univerjs-pro/docs-latex";
import { UniverDocsLatexUIPlugin } from "@univerjs-pro/docs-latex-ui";
import DocsLatexUIEnUS from "@univerjs-pro/docs-latex-ui/locale/en-US";
import { UniverDocsListPlugin } from "@univerjs-pro/docs-list";
import { UniverDocsListUIPlugin } from "@univerjs-pro/docs-list-ui";
import DocsListUIEnUS from "@univerjs-pro/docs-list-ui/locale/en-US";
import { UniverDocsPrintPlugin } from "@univerjs-pro/docs-print";
import DocsPrintEnUS from "@univerjs-pro/docs-print/locale/en-US";
import { UniverDocsQuotePlugin } from "@univerjs-pro/docs-quote";
import { UniverDocsQuoteUIPlugin } from "@univerjs-pro/docs-quote-ui";
import DocsQuoteUIEnUS from "@univerjs-pro/docs-quote-ui/locale/en-US";
import { UniverDocsShapePlugin } from "@univerjs-pro/docs-shape";
import { UniverDocsShapeUIPlugin } from "@univerjs-pro/docs-shape-ui";
import DocsShapeUIEnUS from "@univerjs-pro/docs-shape-ui/locale/en-US";
import { UniverDocsTablePlugin } from "@univerjs-pro/docs-table";
import { UniverDocsTableUIPlugin } from "@univerjs-pro/docs-table-ui";
import DocsTableUIEnUS from "@univerjs-pro/docs-table-ui/locale/en-US";
import { UniverThreadCommentDataSourcePlugin } from "@univerjs-pro/thread-comment-datasource";
import { UniverDocsDrawingPlugin } from "@univerjs/docs-drawing";
import { UniverDocsDrawingUIPlugin } from "@univerjs/docs-drawing-ui";
import DocsDrawingUIEnUS from "@univerjs/docs-drawing-ui/locale/en-US";
import { UniverDocsHyperLinkPlugin } from "@univerjs/docs-hyper-link";
import { UniverDocsHyperLinkUIPlugin } from "@univerjs/docs-hyper-link-ui";
import DocsHyperLinkUIEnUS from "@univerjs/docs-hyper-link-ui/locale/en-US";
import { UniverDocsThreadCommentUIPlugin } from "@univerjs/docs-thread-comment-ui";
import DocsThreadCommentUIEnUS from "@univerjs/docs-thread-comment-ui/locale/en-US";
import { UniverDrawingPlugin } from "@univerjs/drawing";
import { UniverDrawingUIPlugin } from "@univerjs/drawing-ui";
import DrawingUIEnUS from "@univerjs/drawing-ui/locale/en-US";
import { mergeLocales } from "@univerjs/presets";

import "@univerjs-pro/docs-callout-ui/lib/index.css";
import "@univerjs-pro/docs-chart-ui/lib/index.css";
import "@univerjs-pro/docs-code-ui/lib/index.css";
import "@univerjs-pro/docs-column-ui/lib/index.css";
import "@univerjs-pro/docs-latex-ui/lib/index.css";
import "@univerjs-pro/docs-list-ui/lib/index.css";
import "@univerjs-pro/docs-quote-ui/lib/index.css";
import "@univerjs-pro/docs-shape-ui/lib/index.css";
import "@univerjs-pro/docs-table-ui/lib/index.css";
import "@univerjs-pro/exchange-client/lib/index.css";
import "@univerjs/docs-drawing-ui/lib/index.css";
import "@univerjs/docs-hyper-link-ui/lib/index.css";
import "@univerjs/docs-thread-comment-ui/lib/index.css";
import "@univerjs/drawing-ui/lib/index.css";

import "@univerjs-pro/docs-callout/facade";
import "@univerjs-pro/docs-chart/facade";
import "@univerjs-pro/docs-code/facade";
import "@univerjs-pro/docs-column/facade";
import "@univerjs-pro/docs-latex/facade";
import "@univerjs-pro/docs-list/facade";
import "@univerjs-pro/docs-quote/facade";
import "@univerjs-pro/docs-shape/facade";
import "@univerjs-pro/docs-table/facade";
import "@univerjs-pro/exchange-client/facade";
import "@univerjs/docs-drawing/facade";

export const docFeatureLocale = mergeLocales(
  DrawingUIEnUS,
  DocsDrawingUIEnUS,
  DocsHyperLinkUIEnUS,
  DocsThreadCommentUIEnUS,
  DocsCalloutUIEnUS,
  DocsChartUIEnUS,
  DocsCodeUIEnUS,
  DocsColumnUIEnUS,
  DocsLatexUIEnUS,
  DocsListUIEnUS,
  DocsQuoteUIEnUS,
  DocsShapeUIEnUS,
  DocsTableUIEnUS,
  DocsExchangeClientEnUS,
  DocsPrintEnUS
);

/**
 * Doc 的内容模型与编辑能力，顺序与 Univer Pro Doc 协同示例一致。
 * Mention 依赖未纳入当前发布 cohort 的包，因此不在当前依赖面内。
 */
export function getDocContentFeaturePlugins(): IPresetPlugin[] {
  return [
    [
      UniverDrawingPlugin,
      {
        override: [[IImageIoService, null]],
      },
    ],
    UniverDocsShapePlugin,
    UniverDocsShapeUIPlugin,
    UniverDocsTablePlugin,
    UniverDocsTableUIPlugin,
    UniverDocsListPlugin,
    UniverDocsListUIPlugin,
    UniverDocsCalloutPlugin,
    UniverDocsCalloutUIPlugin,
    UniverDocsCodePlugin,
    UniverDocsCodeUIPlugin,
    UniverDocsQuotePlugin,
    UniverDocsQuoteUIPlugin,
    UniverDocsColumnPlugin,
    UniverDocsColumnUIPlugin,
    UniverDocsLatexPlugin,
    UniverDocsLatexUIPlugin,
  ];
}

/** 浏览器协同建立后启用的 Doc drawing、评论、导入与打印能力。 */
export function getDocCollaborationFeaturePlugins(): IPresetPlugin[] {
  return [
    UniverDrawingUIPlugin,
    UniverDocsDrawingPlugin,
    UniverDocsDrawingUIPlugin,
    UniverDocsChartPlugin,
    UniverDocsChartUIPlugin,
    UniverDocsHyperLinkPlugin,
    UniverDocsHyperLinkUIPlugin,
    UniverDocsThreadCommentUIPlugin,
    UniverThreadCommentDataSourcePlugin,
    UniverDocsExchangeClientPlugin,
    UniverDocsPrintPlugin,
  ];
}
