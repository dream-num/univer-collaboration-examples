import {
  IUndoRedoService,
  LocaleType,
  LogLevel,
  Univer,
} from "@univerjs/core";
import { UniverLicensePlugin } from "@univerjs-pro/license";
import { UniverSlidesPlugin } from "@univerjs-pro/slides";
import { UniverSlidesUIPlugin } from "@univerjs-pro/slides-ui";
import { UniverDocsPlugin } from "@univerjs/docs";
import { UniverDocsUIPlugin } from "@univerjs/docs-ui";
import { UniverRenderEnginePlugin } from "@univerjs/engine-render";
import { UniverNetworkPlugin } from "@univerjs/network";
import { UniverUIPlugin } from "@univerjs/ui";
import {
  enforceReadOnlyReview,
  loadCurrentUser,
  registerRawCollaboration,
  syncEditorTitle,
} from "../collaboration.js";

import "@univerjs/ui/lib/index.css";
import "@univerjs/docs-ui/lib/index.css";
import "@univerjs-pro/slides-ui/lib/index.css";

const univer = new Univer({
  locale: LocaleType.EN_US,
  locales: {},
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
univer.registerPlugin(UniverDocsPlugin);
univer.registerPlugin(UniverDocsUIPlugin);
univer.registerPlugin(UniverSlidesPlugin);
univer.registerPlugin(UniverSlidesUIPlugin);
univer.registerPlugin(UniverNetworkPlugin);
registerRawCollaboration(univer);
enforceReadOnlyReview(univer);
syncEditorTitle(
  univer,
  new URL(window.location.href).searchParams.get("unit")
);
void loadCurrentUser(univer);
