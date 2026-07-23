import type { IGetUserResponse } from "@univerjs/protocol";
import {
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
import { HTTPService } from "@univerjs/network";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import UniverPresetSheetsCoreEnUS from "@univerjs/preset-sheets-core/locales/en-US";
import {
  createUniver,
  defaultTheme,
  mergeLocales,
} from "@univerjs/presets";
import { host, httpProtocol, unit, url } from "./consts";
import {
  getCollaborationPlugins,
  getHistoryPlugins,
} from "./plugins";

import "@univerjs/preset-sheets-core/lib/index.css";
import "../global.css";

function main(): void {
  const { univer, univerAPI } = createUniver({
    locale: LocaleType.EN_US,
    locales: {
      [LocaleType.EN_US]: mergeLocales(
        UniverPresetSheetsCoreEnUS,
        CollaborationClientEnUS,
        CollaborationClientUIEnUS,
        EditHistoryLoaderEnUS,
        EditHistoryViewerEnUS
      ),
    },
    theme: defaultTheme,
    logLevel: LogLevel.VERBOSE,
    collaboration: true,
    presets: [
      UniverSheetsCorePreset({
        container: "app",
      }),
    ],
    plugins: [
      [
        UniverLicensePlugin,
        { license: import.meta.env.VITE_UNIVER_LICENSE || undefined },
      ],
      ...getCollaborationPlugins(),
      ...getHistoryPlugins(),
    ],
  });

  window.univer = univer;
  window.univerAPI = univerAPI;
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
