import "@univerjs-pro/collaboration-client/facade";
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
import {
  defaultTheme,
  purpleTheme,
  redTheme,
  yellowTheme,
} from "@univerjs/themes";
import { registerCollaboration } from "./features/collaboration";
import { registerComments } from "./features/comments";
import { registerExchangeAndPrint } from "./features/exchange";
import { registerHistory } from "./features/history";
import { univerLocales } from "./locales";
import type {
  EditorLocale,
  MountedUniverEditor,
  MountUniverEditorOptions,
} from "./types";
import { loadUnitStyles, registerUnitPlugins } from "./units";

const MAX_UNIVER_IMAGE_BYTES = 20 * 1024 * 1024;

export async function mountUniverEditor(
  options: MountUniverEditorOptions,
): Promise<MountedUniverEditor> {
  await loadUnitStyles(options.unitType);

  const univer = createUniver(options.unitType, options.locale);
  registerUnitPlugins(univer, options);

  const baseURL = `${location.protocol}//${location.host}/universer-api`;
  registerCollaboration(univer, baseURL);
  registerExchangeAndPrint(univer, options.unitType, baseURL);
  const commentWorkaround = registerComments(univer, options.unitType);
  registerHistory(
    univer,
    options.unitType,
    `${baseURL}/history`,
    options.container,
  );

  univer.__getInjector().get(UserManagerService).setCurrentUser({
    userID: options.user.userId,
    name: options.user.displayName,
    avatar: "",
  });

  const univerAPI = FUniver.newAPI(univer);
  const membersSubscription = univerAPI.getCollaboration().subscribeCollaborators(
    options.unitId,
    options.onMembersChange,
  );

  return {
    dispose: () => {
      membersSubscription.dispose();
      univerAPI.dispose();
      commentWorkaround?.dispose();
      univer.dispose();
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
  univer.registerPlugin(UniverRenderEnginePlugin);
  univer.registerPlugin(UniverDrawingPlugin, {
    override: [[IImageIoService, null]],
    allowImageSize: MAX_UNIVER_IMAGE_BYTES,
  });

  return univer;
}
