import type { IGetUserResponse } from "@univerjs/protocol";
import {
  IAuthzIoService,
  IImageIoService,
  IMentionIOService,
  IUndoRedoService,
  LocaleType,
  LogLevel,
  Univer,
  UniverInstanceType,
  UserManagerService,
} from "@univerjs/core";
import { FUniver } from "@univerjs/core/facade";
import { UniverLicensePlugin } from "@univerjs-pro/license";
import CollaborationClientEnUS from "@univerjs-pro/collaboration-client/locale/en-US";
import CollaborationClientUIEnUS from "@univerjs-pro/collaboration-client-ui/locale/en-US";
import EditHistoryLoaderEnUS from "@univerjs-pro/edit-history-loader/locale/en-US";
import EditHistoryViewerEnUS from "@univerjs-pro/edit-history-viewer/locale/en-US";
import SheetsChartEnUS from "@univerjs-pro/sheets-chart/locale/en-US";
import SheetsChartUIEnUS from "@univerjs-pro/sheets-chart-ui/locale/en-US";
import SheetsOutlineUIEnUS from "@univerjs-pro/sheets-outline-ui/locale/en-US";
import SheetsPivotEnUS from "@univerjs-pro/sheets-pivot/locale/en-US";
import SheetsPivotUIEnUS from "@univerjs-pro/sheets-pivot-ui/locale/en-US";
import SheetsShapeUIEnUS from "@univerjs-pro/sheets-shape-ui/locale/en-US";
import SheetsSparklineUIEnUS from "@univerjs-pro/sheets-sparkline-ui/locale/en-US";
import { UniverRangePreprocessPlugin } from "@univerjs-pro/range-preprocess";
import { UniverDrawingPlugin } from "@univerjs/drawing";
import { HTTPService } from "@univerjs/network";
import UniverPresetSheetsCoreEnUS from "@univerjs/preset-sheets-core/locales/en-US";
import { defaultTheme, mergeLocales } from "@univerjs/presets";
import DataValidationEnUS from "@univerjs/data-validation/locale/en-US";
import DocsUIEnUS from "@univerjs/docs-ui/locale/en-US";
import DrawingUIEnUS from "@univerjs/drawing-ui/locale/en-US";
import ConditionalFormattingEnUS from "@univerjs/sheets-conditional-formatting/locale/en-US";
import ConditionalFormattingUIEnUS from "@univerjs/sheets-conditional-formatting-ui/locale/en-US";
import CrosshairEnUS from "@univerjs/sheets-crosshair-highlight/locale/en-US";
import SheetsDataValidationEnUS from "@univerjs/sheets-data-validation/locale/en-US";
import SheetsDataValidationUIEnUS from "@univerjs/sheets-data-validation-ui/locale/en-US";
import SheetsDrawingUIEnUS from "@univerjs/sheets-drawing-ui/locale/en-US";
import SheetsFilterEnUS from "@univerjs/sheets-filter/locale/en-US";
import SheetsFilterUIEnUS from "@univerjs/sheets-filter-ui/locale/en-US";
import SheetsFormulaEnUS from "@univerjs/sheets-formula/locale/en-US";
import SheetsFormulaUIEnUS from "@univerjs/sheets-formula-ui/locale/en-US";
import SheetsHyperLinkUIEnUS from "@univerjs/sheets-hyper-link-ui/locale/en-US";
import SheetsNoteUIEnUS from "@univerjs/sheets-note-ui/locale/en-US";
import SheetsNumfmtUIEnUS from "@univerjs/sheets-numfmt-ui/locale/en-US";
import SheetsSortUIEnUS from "@univerjs/sheets-sort-ui/locale/en-US";
import SheetsTableEnUS from "@univerjs/sheets-table/locale/en-US";
import SheetsTableUIEnUS from "@univerjs/sheets-table-ui/locale/en-US";
import { host, httpProtocol, unit, url } from "./consts";
import getClientToolPlugins from "./lazy";
import workerURL from "./worker.ts?worker&url";
import {
  registerBasicPlugins,
  registerCollaborationFeatures,
  registerHistoryFeatures,
  registerSheetPlugins,
} from "./plugins";

import "@univerjs/preset-sheets-core/lib/index.css";
import "@univerjs-pro/collaboration-client-ui/lib/index.css";
import "@univerjs-pro/edit-history-viewer/lib/index.css";
import "@univerjs-pro/live-share/lib/index.css";
import "@univerjs-pro/sheets-chart-ui/lib/index.css";
import "@univerjs-pro/sheets-outline-ui/lib/index.css";
import "@univerjs-pro/sheets-pivot-ui/lib/index.css";
import "@univerjs-pro/sheets-shape-ui/lib/index.css";
import "@univerjs-pro/sheets-sparkline-ui/lib/index.css";
import "@univerjs/drawing-ui/lib/index.css";
import "@univerjs/sheets-conditional-formatting-ui/lib/index.css";
import "@univerjs/sheets-crosshair-highlight/lib/index.css";
import "@univerjs/sheets-data-validation-ui/lib/index.css";
import "@univerjs/sheets-drawing-ui/lib/index.css";
import "@univerjs/sheets-filter-ui/lib/index.css";
import "@univerjs/sheets-hyper-link-ui/lib/index.css";
import "@univerjs/sheets-note-ui/lib/index.css";
import "@univerjs/sheets-sort-ui/lib/index.css";
import "@univerjs/sheets-table-ui/lib/index.css";
import "../global.css";

import "@univerjs/sheets/facade";
import "@univerjs/sheets-numfmt/facade";
import "@univerjs/ui/facade";
import "@univerjs/docs-ui/facade";
import "@univerjs/sheets-ui/facade";
import "@univerjs/sheets-data-validation/facade";
import "@univerjs-pro/sheets-pivot/facade";
import "@univerjs-pro/sheets-chart/facade";
import "@univerjs-pro/sheets-shape/facade";
import "@univerjs-pro/sheets-sparkline/facade";
import "@univerjs-pro/sheets-outline/facade";
import "@univerjs/sheets-table/facade";
import "@univerjs/sheets-formula/facade";
import "@univerjs-pro/live-share/facade";
import "@univerjs-pro/range-preprocess/facade";
import "@univerjs-pro/collaboration-client/facade";

function main(): void {
  const univer = new Univer({
    locale: LocaleType.EN_US,
    locales: {
      [LocaleType.EN_US]: mergeLocales(
        UniverPresetSheetsCoreEnUS,
        CollaborationClientEnUS,
        CollaborationClientUIEnUS,
        EditHistoryLoaderEnUS,
        EditHistoryViewerEnUS,
        DataValidationEnUS,
        DocsUIEnUS,
        DrawingUIEnUS,
        ConditionalFormattingEnUS,
        ConditionalFormattingUIEnUS,
        CrosshairEnUS,
        SheetsDataValidationEnUS,
        SheetsDataValidationUIEnUS,
        SheetsDrawingUIEnUS,
        SheetsFilterEnUS,
        SheetsFilterUIEnUS,
        SheetsFormulaEnUS,
        SheetsFormulaUIEnUS,
        SheetsHyperLinkUIEnUS,
        SheetsNoteUIEnUS,
        SheetsNumfmtUIEnUS,
        SheetsSortUIEnUS,
        SheetsTableEnUS,
        SheetsTableUIEnUS,
        SheetsChartEnUS,
        SheetsChartUIEnUS,
        SheetsOutlineUIEnUS,
        SheetsPivotEnUS,
        SheetsPivotUIEnUS,
        SheetsShapeUIEnUS,
        SheetsSparklineUIEnUS
      ),
    },
    theme: defaultTheme,
    override: [
      [IAuthzIoService, null],
      [IUndoRedoService, null],
      [IMentionIOService, null],
    ],
    logLevel: LogLevel.VERBOSE,
  });

  univer.registerPlugin(UniverDrawingPlugin, {
    // 文件服务不在当前 demo 范围内，图片上传和远程读取暂时关闭。
    override: [[IImageIoService, null]],
  });
  univer.registerPlugin(UniverLicensePlugin, {
    license: import.meta.env.VITE_UNIVER_LICENSE || undefined,
  });
  univer.registerPlugin(UniverRangePreprocessPlugin);

  registerBasicPlugins(univer, workerURL);
  registerSheetPlugins(univer);
  registerCollaborationFeatures(univer);
  registerHistoryFeatures(univer, workerURL);
  for (const plugin of getClientToolPlugins()) {
    univer.registerPlugin(plugin[0], plugin[1]);
  }

  window.univer = univer;
  window.univerAPI = FUniver.newAPI(univer);
  void fetchServerUser(univer);
}

async function fetchServerUser(univer: Univer): Promise<void> {
  const injector = univer.__getInjector();
  const userService = injector.get(UserManagerService);
  const httpService = injector.get(HTTPService);
  const response = await httpService.get<IGetUserResponse>(
    `${httpProtocol}://${host}/universer-api/user`
  );
  if (response.body.user) {
    userService.setCurrentUser(response.body.user);
  }
}

if (unit) {
  main();
} else {
  fetch(`${httpProtocol}://${host}/universer-api/snapshot/2/unit/-/create`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: UniverInstanceType.UNIVER_SHEET,
      name: "New Sheet",
      creator: "demo-user",
    }),
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error("Failed to create new unit");
      }
      return response.json() as Promise<{ readonly unitID?: string }>;
    })
    .then((response) => {
      if (!response.unitID) {
        throw new Error("Failed to create new unit");
      }
      url.searchParams.set("unit", response.unitID);
      url.searchParams.set("type", String(UniverInstanceType.UNIVER_SHEET));
      window.location.href = url.toString();
    })
    .catch((error: unknown) => {
      console.error(error);
    });
}

declare global {
  interface Window {
    univer?: Univer;
    univerAPI?: FUniver;
  }
}
