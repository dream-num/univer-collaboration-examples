import {
  LocaleType,
  LogLevel,
} from "@univerjs/core";
import { UniverLicensePlugin } from "@univerjs-pro/license";
import EditHistoryLoaderEnUS from "@univerjs-pro/edit-history-loader/locale/en-US";
import EditHistoryViewerEnUS from "@univerjs-pro/edit-history-viewer/locale/en-US";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import UniverPresetSheetsCoreEnUS from "@univerjs/preset-sheets-core/locales/en-US";
import {
  createUniver,
  defaultTheme,
  mergeLocales,
} from "@univerjs/presets";
import {
  collaborationPlugins,
  historyPlugins,
  loadCurrentUser,
} from "../collaboration.js";

import "@univerjs/preset-sheets-core/lib/index.css";

const { univer } = createUniver({
  locale: LocaleType.EN_US,
  locales: {
    [LocaleType.EN_US]: mergeLocales(
      UniverPresetSheetsCoreEnUS,
      EditHistoryLoaderEnUS,
      EditHistoryViewerEnUS
    ),
  },
  theme: defaultTheme,
  logLevel: LogLevel.WARN,
  collaboration: true,
  presets: [UniverSheetsCorePreset({ container: "univer-container" })],
  plugins: [
    [
      UniverLicensePlugin,
      { license: import.meta.env.VITE_UNIVER_LICENSE || undefined },
    ],
    ...collaborationPlugins(),
    ...historyPlugins(),
  ],
});

void loadCurrentUser(univer);
