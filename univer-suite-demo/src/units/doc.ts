import {
  LocaleType,
  LogLevel,
} from "@univerjs/core";
import { UniverLicensePlugin } from "@univerjs-pro/license";
import { UniverDocsCorePreset } from "@univerjs/preset-docs-core";
import UniverPresetDocsCoreEnUS from "@univerjs/preset-docs-core/locales/en-US";
import {
  createUniver,
  defaultTheme,
  mergeLocales,
} from "@univerjs/presets";
import {
  collaborationPlugins,
  loadCurrentUser,
} from "../collaboration.js";

import "@univerjs/preset-docs-core/lib/index.css";

const { univer } = createUniver({
  locale: LocaleType.EN_US,
  locales: {
    [LocaleType.EN_US]: mergeLocales(UniverPresetDocsCoreEnUS),
  },
  theme: defaultTheme,
  logLevel: LogLevel.WARN,
  collaboration: true,
  presets: [UniverDocsCorePreset({ container: "univer-container" })],
  plugins: [
    [
      UniverLicensePlugin,
      { license: import.meta.env.VITE_UNIVER_LICENSE || undefined },
    ],
    ...collaborationPlugins(),
  ],
});

void loadCurrentUser(univer);
