import { UniverBoardsPlugin } from "@univerjs-pro/boards";
import { UniverBoardsMindPlugin } from "@univerjs-pro/boards-mind";
import { UniverBoardsMindUIPlugin } from "@univerjs-pro/boards-mind-ui";
import { UniverBoardsTablePlugin } from "@univerjs-pro/boards-table";
import { UniverBoardsTableUIPlugin } from "@univerjs-pro/boards-table-ui";
import { UniverBoardsUIPlugin } from "@univerjs-pro/boards-ui";
import { UniverInkPlugin } from "@univerjs-pro/ink";
import { UniverInkUIPlugin } from "@univerjs-pro/ink-ui";
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
import { UniverDrawingPlugin } from "@univerjs/drawing";
import { UniverRenderEnginePlugin } from "@univerjs/engine-render";
import { UniverNetworkPlugin } from "@univerjs/network";
import { UniverUIPlugin } from "@univerjs/ui";
import {
  enforceReadOnlyReview,
  loadCurrentUser,
  registerRawCollaboration,
} from "../collaboration.js";

import "@univerjs/ui/lib/index.css";
import "@univerjs/docs-ui/lib/index.css";
import "@univerjs-pro/boards-ui/lib/index.css";
import "@univerjs-pro/boards-mind-ui/lib/index.css";
import "@univerjs-pro/boards-table-ui/lib/index.css";
import "@univerjs-pro/ink-ui/lib/index.css";

const univer = new Univer({
  locale: LocaleType.EN_US,
  locales: {},
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
univer.registerPlugin(UniverDrawingPlugin, {
  override: [[IImageIoService, null]],
});
univer.registerPlugin(UniverDocsPlugin);
univer.registerPlugin(UniverDocsUIPlugin);
univer.registerPlugin(UniverInkPlugin);
univer.registerPlugin(UniverInkUIPlugin);
univer.registerPlugin(UniverBoardsPlugin);
univer.registerPlugin(UniverBoardsUIPlugin);
univer.registerPlugin(UniverBoardsMindPlugin);
univer.registerPlugin(UniverBoardsMindUIPlugin);
univer.registerPlugin(UniverBoardsTablePlugin);
univer.registerPlugin(UniverBoardsTableUIPlugin);
univer.registerPlugin(UniverNetworkPlugin);
registerRawCollaboration(univer);
enforceReadOnlyReview(univer);
void loadCurrentUser(univer);
