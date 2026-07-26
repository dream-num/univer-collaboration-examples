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
  collaborationLocale,
  collaborationPlugins,
  enforceReadOnlyReview,
  loadCurrentUser,
  syncEditorTitle,
} from "../collaboration.js";
import {
  docFeatureLocale,
  getDocCollaborationFeaturePlugins,
  getDocContentFeaturePlugins,
} from "./doc-features.js";

import "@univerjs/preset-docs-core/lib/index.css";

const { univer } = createUniver({
  locale: LocaleType.EN_US,
  locales: {
    [LocaleType.EN_US]: mergeLocales(
      UniverPresetDocsCoreEnUS,
      docFeatureLocale,
      collaborationLocale
    ),
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
    ...getDocContentFeaturePlugins(),
    ...collaborationPlugins(),
    ...getDocCollaborationFeaturePlugins(),
  ],
});

enforceReadOnlyReview(univer);
syncEditorTitle(
  univer,
  new URL(window.location.href).searchParams.get("unit")
);
void loadCurrentUser(univer);
