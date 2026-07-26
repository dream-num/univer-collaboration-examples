import {
  IImageIoService,
  IUndoRedoService,
  LocaleType,
  LogLevel,
  Univer,
} from "@univerjs/core";
import { UniverLicensePlugin } from "@univerjs-pro/license";
import { UniverExchangeClientPlugin } from "@univerjs-pro/exchange-client";
import ExchangeClientEnUS from "@univerjs-pro/exchange-client/locale/en-US";
import { UniverSlidesPlugin } from "@univerjs-pro/slides";
import SlidesEnUS from "@univerjs-pro/slides/locale/en-US";
import { UniverSlidesChartPlugin } from "@univerjs-pro/slides-chart";
import { UniverSlidesChartUIPlugin } from "@univerjs-pro/slides-chart-ui";
import SlidesChartUIEnUS from "@univerjs-pro/slides-chart-ui/locale/en-US";
import { UniverSlidesExchangeClientPlugin } from "@univerjs-pro/slides-exchange-client";
import SlidesExchangeClientEnUS from "@univerjs-pro/slides-exchange-client/locale/en-US";
import { UniverSlidesPrintPlugin } from "@univerjs-pro/slides-print";
import SlidesPrintEnUS from "@univerjs-pro/slides-print/locale/en-US";
import { UniverSlidesTablePlugin } from "@univerjs-pro/slides-table";
import { UniverSlidesTableUIPlugin } from "@univerjs-pro/slides-table-ui";
import SlidesTableUIEnUS from "@univerjs-pro/slides-table-ui/locale/en-US";
import { UniverSlidesUIPlugin } from "@univerjs-pro/slides-ui";
import SlidesUIEnUS from "@univerjs-pro/slides-ui/locale/en-US";
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
  syncEditorTitle,
} from "../collaboration.js";

import "@univerjs/ui/lib/index.css";
import "@univerjs/docs-ui/lib/index.css";
import "@univerjs-pro/slides-chart-ui/lib/index.css";
import "@univerjs-pro/slides-table-ui/lib/index.css";
import "@univerjs-pro/slides-ui/lib/index.css";
import "@univerjs-pro/exchange-client/lib/index.css";

import "@univerjs-pro/engine-shape/facade";
import "@univerjs-pro/exchange-client/facade";
import "@univerjs-pro/slides/facade";
import "@univerjs-pro/slides-chart/facade";
import "@univerjs-pro/slides-print/facade";
import "@univerjs-pro/slides-table/facade";

const univer = new Univer({
  locale: LocaleType.EN_US,
  locales: {
    [LocaleType.EN_US]: mergeLocales(
      UIEnUS,
      DocsUIEnUS,
      ExchangeClientEnUS,
      SlidesEnUS,
      SlidesUIEnUS,
      SlidesChartUIEnUS,
      SlidesTableUIEnUS,
      SlidesExchangeClientEnUS,
      SlidesPrintEnUS,
      collaborationLocale
    ),
  },
  logLevel: LogLevel.WARN,
  override: [
    [IUndoRedoService, null],
  ],
});

univer.registerPlugin(UniverLicensePlugin, {
  license: import.meta.env.VITE_UNIVER_LICENSE || undefined,
});
univer.registerPlugin(UniverRenderEnginePlugin);
univer.registerPlugin(UniverUIPlugin, {
  container: "univer-container",
  ribbonType: "classic",
});
univer.registerPlugin(UniverNetworkPlugin);
univer.registerPlugin(UniverDocsPlugin);
univer.registerPlugin(UniverDocsUIPlugin);
univer.registerPlugin(UniverDrawingPlugin, {
  override: [[IImageIoService, null]],
});
univer.registerPlugin(UniverSlidesPlugin);
univer.registerPlugin(UniverSlidesUIPlugin);
univer.registerPlugin(UniverSlidesPrintPlugin);
univer.registerPlugin(UniverSlidesChartPlugin);
univer.registerPlugin(UniverSlidesChartUIPlugin);
univer.registerPlugin(UniverSlidesTablePlugin);
univer.registerPlugin(UniverSlidesTableUIPlugin);
univer.registerPlugin(UniverExchangeClientPlugin);
univer.registerPlugin(UniverSlidesExchangeClientPlugin);
registerRawCollaboration(univer);
enforceReadOnlyReview(univer);
syncEditorTitle(
  univer,
  new URL(window.location.href).searchParams.get("unit")
);
void loadCurrentUser(univer);
