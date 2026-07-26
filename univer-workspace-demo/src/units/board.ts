import { BoardToolType, UniverBoardsPlugin } from "@univerjs-pro/boards";
import { UniverBoardsChartPlugin } from "@univerjs-pro/boards-chart";
import { UniverBoardsChartUIPlugin } from "@univerjs-pro/boards-chart-ui";
import BoardsChartUIEnUS from "@univerjs-pro/boards-chart-ui/locale/en-US";
import { UniverBoardsMindPlugin } from "@univerjs-pro/boards-mind";
import { UniverBoardsMindUIPlugin } from "@univerjs-pro/boards-mind-ui";
import BoardsMindUIEnUS from "@univerjs-pro/boards-mind-ui/locale/en-US";
import { UniverBoardsTablePlugin } from "@univerjs-pro/boards-table";
import { UniverBoardsTableUIPlugin } from "@univerjs-pro/boards-table-ui";
import BoardsTableUIEnUS from "@univerjs-pro/boards-table-ui/locale/en-US";
import { UniverBoardsUIPlugin } from "@univerjs-pro/boards-ui";
import BoardsUIEnUS from "@univerjs-pro/boards-ui/locale/en-US";
import { UniverDocsLatexPlugin } from "@univerjs-pro/docs-latex";
import { UniverDocsLatexUIPlugin } from "@univerjs-pro/docs-latex-ui";
import DocsLatexUIEnUS from "@univerjs-pro/docs-latex-ui/locale/en-US";
import { UniverExchangeClientPlugin } from "@univerjs-pro/exchange-client";
import ExchangeClientEnUS from "@univerjs-pro/exchange-client/locale/en-US";
import { UniverInkPlugin } from "@univerjs-pro/ink";
import { UniverInkUIPlugin } from "@univerjs-pro/ink-ui";
import InkUIEnUS from "@univerjs-pro/ink-ui/locale/en-US";
import { UniverLicensePlugin } from "@univerjs-pro/license";
import {
  IImageIoService,
  IUndoRedoService,
  LocaleType,
  LogLevel,
  Univer,
} from "@univerjs/core";
import { UniverDocsPlugin } from "@univerjs/docs";
import { UniverDocsUIPlugin } from "@univerjs/docs-ui";
import DocsUIEnUS from "@univerjs/docs-ui/locale/en-US";
import { UniverDrawingPlugin } from "@univerjs/drawing";
import { UniverRenderEnginePlugin } from "@univerjs/engine-render";
import { UniverNetworkPlugin } from "@univerjs/network";
import { mergeLocales } from "@univerjs/presets";
import { UniverUIPlugin } from "@univerjs/ui";
import UIEnUS from "@univerjs/ui/locale/en-US";
import {
  collaborationLocale,
  enforceReadOnlyReview,
  loadCurrentUser,
  registerRawCollaboration,
} from "../collaboration.js";

import "@univerjs/ui/lib/index.css";
import "@univerjs/docs-ui/lib/index.css";
import "@univerjs-pro/boards-ui/lib/index.css";
import "@univerjs-pro/boards-chart-ui/lib/index.css";
import "@univerjs-pro/boards-mind-ui/lib/index.css";
import "@univerjs-pro/boards-table-ui/lib/index.css";
import "@univerjs-pro/docs-latex-ui/lib/index.css";
import "@univerjs-pro/exchange-client/lib/index.css";
import "@univerjs-pro/ink-ui/lib/index.css";

import "@univerjs-pro/boards/facade";
import "@univerjs-pro/boards-chart/facade";
import "@univerjs-pro/boards-mind/facade";
import "@univerjs-pro/boards-table/facade";
import "@univerjs-pro/docs-latex/facade";
import "@univerjs-pro/exchange-client/facade";
import "@univerjs-pro/ink/facade";

const univer = new Univer({
  locale: LocaleType.EN_US,
  locales: {
    [LocaleType.EN_US]: mergeLocales(
      UIEnUS,
      DocsUIEnUS,
      DocsLatexUIEnUS,
      ExchangeClientEnUS,
      InkUIEnUS,
      BoardsUIEnUS,
      BoardsChartUIEnUS,
      BoardsMindUIEnUS,
      BoardsTableUIEnUS,
      collaborationLocale
    ),
  },
  logLevel: LogLevel.WARN,
  override: [[IUndoRedoService, null]],
});

univer.registerPlugin(UniverLicensePlugin, {
  license: import.meta.env.VITE_UNIVER_LICENSE || undefined,
});
univer.registerPlugin(UniverRenderEnginePlugin);
univer.registerPlugin(UniverUIPlugin, {
  container: "univer-container",
  ribbonType: "grid",
});
univer.registerPlugin(UniverNetworkPlugin);
univer.registerPlugin(UniverDrawingPlugin, {
  override: [[IImageIoService, null]],
});
univer.registerPlugin(UniverDocsPlugin);
univer.registerPlugin(UniverDocsUIPlugin);
univer.registerPlugin(UniverDocsLatexPlugin);
univer.registerPlugin(UniverDocsLatexUIPlugin);
univer.registerPlugin(UniverExchangeClientPlugin);
univer.registerPlugin(UniverBoardsPlugin);
univer.registerPlugin(UniverInkPlugin);
univer.registerPlugin(UniverInkUIPlugin);
univer.registerPlugin(UniverBoardsUIPlugin, {
  toolbar: {
    tools: {
      [BoardToolType.Import]: true,
    },
  },
});
univer.registerPlugin(UniverBoardsChartPlugin);
univer.registerPlugin(UniverBoardsChartUIPlugin);
univer.registerPlugin(UniverBoardsMindPlugin);
univer.registerPlugin(UniverBoardsMindUIPlugin);
univer.registerPlugin(UniverBoardsTablePlugin);
univer.registerPlugin(UniverBoardsTableUIPlugin);
registerRawCollaboration(univer);
enforceReadOnlyReview(univer);
void loadCurrentUser(univer);
