import { UniverCollaborationPlugin } from "@univerjs-pro/collaboration";
import { UniverLicensePlugin } from "@univerjs-pro/license";
import {
  IAuthzIoService,
  IImageIoService,
  IMentionIOService,
  IUndoRedoService,
  LocaleType,
  LogLevel,
  Univer,
  UserManagerService,
} from "@univerjs/core";
import { FUniver } from "@univerjs/core/facade";
import { UniverDrawingPlugin } from "@univerjs/drawing";
import { UniverRenderEnginePlugin } from "@univerjs/engine-render";
import { UniverType } from "@univerjs/protocol";
import { defaultTheme, greenTheme, purpleTheme, redTheme, yellowTheme } from "@univerjs/themes";
import { unitLink } from "../../shared/units";
import { univerLocales } from "./locales";
import type { EditorLocale, MountedUniverEditor, MountUniverEditorOptions } from "./types";
import { loadUnit, loadUnitStyles, registerUnitPlugins } from "./units";

import "./import-export/utilities.css";

const MAX_UNIVER_IMAGE_BYTES = 20 * 1024 * 1024;

declare global {
  interface Window {
    /** The current editor's Univer instance, exposed for the browser console. */
    univer?: Univer;
    /** The current editor's Facade API, exposed for the browser console. */
    univerAPI?: FUniver;
  }
}

export async function mountUniverEditor(
  options: MountUniverEditorOptions,
): Promise<MountedUniverEditor> {
  await loadUnitStyles(options.unitType);

  const univer = createUniver(options.unitType, options.locale);
  // Each Unit type registers everything it needs, including the collaboration client.
  registerUnitPlugins(univer, options);

  univer.__getInjector().get(UserManagerService).setCurrentUser({
    userID: options.user.userId,
    name: options.user.displayName,
    avatar: "",
  });

  const univerAPI = FUniver.newAPI(univer);
  window.univer = univer;
  window.univerAPI = univerAPI;
  const unit = await loadUnit(univerAPI, options.unitType, options.unitId);
  if (!unit) throw new Error("Unit could not be loaded");

  return {
    univerAPI,
    dispose: () => {
      univerAPI.dispose();
      univer.dispose();
      delete window.univer;
      delete window.univerAPI;
    },
    setLocale: (locale) => univer.setLocale(toUniverLocale(locale)),
  };
}

function toUniverLocale(locale: EditorLocale) {
  return locale === "zh-CN" ? LocaleType.ZH_CN : LocaleType.EN_US;
}

function getUnitTheme(unitType: number) {
  if (unitType === UniverType.UNIVER_SLIDE) return purpleTheme;
  if (unitType === UniverType.UNIVER_BOARD) return redTheme;
  if (unitType === UniverType.UNIVER_BASE) return yellowTheme;
  if (unitType === UniverType.UNIVER_PDF) return greenTheme;
  return defaultTheme;
}

function createUniver(unitType: number, locale: EditorLocale) {
  const univer = new Univer({
    theme: getUnitTheme(unitType),
    locale: toUniverLocale(locale),
    locales: univerLocales,
    logLevel: LogLevel.WARN,
    override: [
      [IAuthzIoService, null],
      [IUndoRedoService, null],
      [IMentionIOService, null],
    ],
  });

  univer.registerPlugin(UniverLicensePlugin, {
    license: import.meta.env.UNIVER_LICENSE || undefined,
  });
  // Register before Unit plugins: the PDF editor plugin depends on it and would otherwise
  // register it implicitly, making a later explicit registration a duplicate.
  univer.registerPlugin(UniverCollaborationPlugin);
  univer.registerPlugin(UniverRenderEnginePlugin);
  univer.registerPlugin(UniverDrawingPlugin, {
    override: [[IImageIoService, null]],
    allowImageSize: MAX_UNIVER_IMAGE_BYTES,
    // Embedded Office attachments open here after they are converted to online Units.
    ole: { getLink: unitLink },
  });

  return univer;
}
