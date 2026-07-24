import {
  IPermissionService,
  LocaleType,
  LogLevel,
} from "@univerjs/core";
import { UniverLicensePlugin } from "@univerjs-pro/license";
import EditHistoryLoaderEnUS from "@univerjs-pro/edit-history-loader/locale/en-US";
import EditHistoryViewerEnUS from "@univerjs-pro/edit-history-viewer/locale/en-US";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import UniverPresetSheetsCoreEnUS from "@univerjs/preset-sheets-core/locales/en-US";
import { WorkbookEditablePermission } from "@univerjs/sheets";
import {
  createUniver,
  defaultTheme,
  mergeLocales,
} from "@univerjs/presets";
import {
  collaborationPlugins,
  historyPlugins,
  loadCurrentUser,
  syncEditorTitle,
} from "../collaboration.js";
import {
  getSheetCollaborationFeaturePlugins,
  getSheetFeaturePlugins,
  sheetFeatureLocale,
} from "./sheet-features.js";

import "@univerjs/preset-sheets-core/lib/index.css";

const { univer } = createUniver({
  locale: LocaleType.EN_US,
  locales: {
    [LocaleType.EN_US]: mergeLocales(
      UniverPresetSheetsCoreEnUS,
      EditHistoryLoaderEnUS,
      EditHistoryViewerEnUS,
      sheetFeatureLocale
    ),
  },
  theme: defaultTheme,
  logLevel: LogLevel.WARN,
  collaboration: true,
  presets: [
    UniverSheetsCorePreset({
      container: "univer-container",
      ribbonType: "grid",
    }),
  ],
  plugins: [
    [
      UniverLicensePlugin,
      { license: import.meta.env.VITE_UNIVER_LICENSE || undefined },
    ],
    ...getSheetFeaturePlugins(),
    ...collaborationPlugins(),
    ...getSheetCollaborationFeaturePlugins(),
    ...historyPlugins(),
  ],
});

const unitID = new URL(window.location.href).searchParams.get("unit");
syncEditorTitle(univer, unitID);
if (document.documentElement.dataset.accessRole === "viewer") {
  if (unitID) {
    const permissionService = univer.__getInjector().get(IPermissionService);
    const permission = new WorkbookEditablePermission(unitID);
    if (!permissionService.getPermissionPoint(permission.id)) {
      permissionService.addPermissionPoint(permission);
    }
    permissionService.updatePermissionPoint(permission.id, false);
  }
}

void loadCurrentUser(univer);
