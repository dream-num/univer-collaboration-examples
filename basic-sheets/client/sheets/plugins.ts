import type { Univer } from "@univerjs/core";
import { UniverCollaborationPlugin } from "@univerjs-pro/collaboration";
import {
  ISingleActiveUnitService,
  UniverCollaborationClientPlugin,
} from "@univerjs-pro/collaboration-client";
import {
  BrowserCollaborationSocketService,
  UniverCollaborationClientUIPlugin,
  WebBrowserSingleActiveUnitService,
} from "@univerjs-pro/collaboration-client-ui";
import { UniverEditHistoryLoaderPlugin } from "@univerjs-pro/edit-history-loader";
import { UniverProFormulaEnginePlugin } from "@univerjs-pro/engine-formula";
import { UniverSheetsChartPlugin } from "@univerjs-pro/sheets-chart";
import { UniverSheetsChartUIPlugin } from "@univerjs-pro/sheets-chart-ui";
import { UniverSheetsOutlinePlugin } from "@univerjs-pro/sheets-outline";
import { UniverSheetsOutlineUIPlugin } from "@univerjs-pro/sheets-outline-ui";
import { UniverSheetsPivotTablePlugin } from "@univerjs-pro/sheets-pivot";
import { UniverSheetsShapePlugin } from "@univerjs-pro/sheets-shape";
import { UniverSheetsShapeUIPlugin } from "@univerjs-pro/sheets-shape-ui";
import { UniverSheetSparklinePlugin } from "@univerjs-pro/sheets-sparkline";
import { UniverSheetSparklineUIPlugin } from "@univerjs-pro/sheets-sparkline-ui";
import { UniverDataValidationPlugin } from "@univerjs/data-validation";
import { UniverDocsPlugin } from "@univerjs/docs";
import { UniverDocsUIPlugin } from "@univerjs/docs-ui";
import { UniverDrawingUIPlugin } from "@univerjs/drawing-ui";
import { UniverRenderEnginePlugin } from "@univerjs/engine-render";
import {
  FetchHTTPImplementation,
  IHTTPImplementation,
} from "@univerjs/network";
import { UniverRPCMainThreadPlugin } from "@univerjs/rpc";
import { UniverSheetsPlugin } from "@univerjs/sheets";
import { UniverSheetsConditionalFormattingPlugin } from "@univerjs/sheets-conditional-formatting";
import { UniverSheetsDataValidationPlugin } from "@univerjs/sheets-data-validation";
import { UniverSheetsDataValidationUIPlugin } from "@univerjs/sheets-data-validation-ui";
import { UniverSheetsDrawingPlugin } from "@univerjs/sheets-drawing";
import { UniverSheetsDrawingUIPlugin } from "@univerjs/sheets-drawing-ui";
import { UniverSheetsFilterPlugin } from "@univerjs/sheets-filter";
import { UniverSheetsFormulaPlugin } from "@univerjs/sheets-formula";
import { UniverSheetsFormulaUIPlugin } from "@univerjs/sheets-formula-ui";
import { UniverSheetsNotePlugin } from "@univerjs/sheets-note";
import { UniverSheetsNoteUIPlugin } from "@univerjs/sheets-note-ui";
import { UniverSheetsNumfmtPlugin } from "@univerjs/sheets-numfmt";
import { UniverSheetsSortPlugin } from "@univerjs/sheets-sort";
import { UniverSheetsTablePlugin } from "@univerjs/sheets-table";
import { UniverSheetsTableUIPlugin } from "@univerjs/sheets-table-ui";
import { UniverSheetsUIPlugin } from "@univerjs/sheets-ui";
import { UniverUIPlugin } from "@univerjs/ui";
import { host, httpProtocol, wsProtocol } from "./consts";

export function registerBasicPlugins(
  univer: Univer,
  workerURL: string
): void {
  univer.registerPlugin(UniverRenderEnginePlugin);
  univer.registerPlugin(UniverProFormulaEnginePlugin, {
    notExecuteFormula: true,
  });
  univer.registerPlugin(UniverUIPlugin, {
    container: "app",
    ribbonType: "grid",
  });
  univer.registerPlugin(UniverDocsPlugin);
  univer.registerPlugin(UniverDocsUIPlugin);
  univer.registerPlugin(UniverRPCMainThreadPlugin, { workerURL });
}

export function registerSheetPlugins(univer: Univer): void {
  univer.registerPlugin(UniverSheetsNumfmtPlugin);
  univer.registerPlugin(UniverSheetsPlugin, {
    notExecuteFormula: true,
  });
  univer.registerPlugin(UniverSheetsUIPlugin);

  univer.registerPlugin(UniverSheetsOutlinePlugin);
  univer.registerPlugin(UniverSheetsOutlineUIPlugin);
  univer.registerPlugin(UniverSheetsFormulaPlugin);
  univer.registerPlugin(UniverSheetsFormulaUIPlugin);
  univer.registerPlugin(UniverSheetsConditionalFormattingPlugin);
  univer.registerPlugin(UniverDataValidationPlugin);
  univer.registerPlugin(UniverSheetsDataValidationPlugin);
  univer.registerPlugin(UniverSheetsDataValidationUIPlugin);
  univer.registerPlugin(UniverSheetsFilterPlugin);
  univer.registerPlugin(UniverDrawingUIPlugin);
  univer.registerPlugin(UniverSheetsDrawingPlugin);
  univer.registerPlugin(UniverSheetsDrawingUIPlugin);
  univer.registerPlugin(UniverSheetsSortPlugin);

  univer.registerPlugin(UniverSheetsPivotTablePlugin, {
    notExecuteFormula: true,
  });
  univer.registerPlugin(UniverSheetsChartPlugin);
  univer.registerPlugin(UniverSheetsChartUIPlugin, {
    enableChartElementFloatMenu: true,
  });
  univer.registerPlugin(UniverSheetSparklinePlugin);
  univer.registerPlugin(UniverSheetSparklineUIPlugin);
  univer.registerPlugin(UniverSheetsTablePlugin);
  univer.registerPlugin(UniverSheetsTableUIPlugin);
  univer.registerPlugin(UniverSheetsShapePlugin);
  univer.registerPlugin(UniverSheetsShapeUIPlugin);
}

export function registerCollaborationFeatures(univer: Univer): void {
  univer.registerPlugin(UniverCollaborationPlugin);
  univer.registerPlugin(UniverCollaborationClientPlugin, {
    socketService: BrowserCollaborationSocketService,
    enableOfflineEditing: true,
    enableSingleActiveInstanceLock: true,
    enableAuthServer: true,
    override: [
      [IHTTPImplementation, { useClass: FetchHTTPImplementation }],
      [
        ISingleActiveUnitService,
        { useClass: WebBrowserSingleActiveUnitService },
      ],
    ],
    authzUrl: `${httpProtocol}://${host}/universer-api/authz`,
    snapshotServerUrl: `${httpProtocol}://${host}/universer-api/snapshot`,
    collabSubmitChangesetUrl: `${httpProtocol}://${host}/universer-api/comb`,
    collabWebSocketUrl: `${wsProtocol}://${host}/universer-api/comb/connect`,
    wsSessionTicketUrl: `${httpProtocol}://${host}/universer-api/user/session-ticket`,
    loginUrlKey: `${httpProtocol}://${host}/universer-api/oidc/authpage`,
    sendChangesetTimeout: 200,
  });
  univer.registerPlugin(UniverCollaborationClientUIPlugin);
  univer.registerPlugin(UniverSheetsNotePlugin);
  univer.registerPlugin(UniverSheetsNoteUIPlugin);
}

export function registerHistoryFeatures(
  univer: Univer,
  workerURL: string
): void {
  univer.registerPlugin(UniverEditHistoryLoaderPlugin, {
    historyListServerUrl: `${httpProtocol}://${host}/universer-api/history`,
    univerContainerId: "app",
    workerURL,
  });
}
