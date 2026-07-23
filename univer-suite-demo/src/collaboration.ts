import type { IGetUserResponse } from "@univerjs/protocol";
import type { IPresetPlugin } from "@univerjs/presets";
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
import {
  Univer,
  UserManagerService,
} from "@univerjs/core";
import { HTTPService } from "@univerjs/network";

const secure = window.location.protocol === "https:";
const httpProtocol = secure ? "https" : "http";
const wsProtocol = secure ? "wss" : "ws";
const host = window.location.host;

export function collaborationPlugins(): IPresetPlugin[] {
  return [
    UniverCollaborationPlugin,
    [
      UniverCollaborationClientPlugin,
      {
        socketService: BrowserCollaborationSocketService,
        enableOfflineEditing: true,
        enableSingleActiveInstanceLock: true,
        enableAuthServer: true,
        override: [
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
        sendChangesetTimeout: 200,
      },
    ],
    UniverCollaborationClientUIPlugin,
  ];
}

export function historyPlugins(): IPresetPlugin[] {
  return [
    [
      UniverEditHistoryLoaderPlugin,
      {
        historyListServerUrl: `${httpProtocol}://${host}/universer-api/history`,
        univerContainerId: "univer-container",
      },
    ],
  ];
}

export function registerRawCollaboration(univer: Univer): void {
  for (const plugin of collaborationPlugins()) {
    if (Array.isArray(plugin)) {
      univer.registerPlugin(plugin[0], plugin[1] as never);
    } else {
      univer.registerPlugin(plugin);
    }
  }
}

export async function loadCurrentUser(univer: Univer): Promise<void> {
  const injector = univer.__getInjector();
  const response = await injector
    .get(HTTPService)
    .get<IGetUserResponse>(`${httpProtocol}://${host}/universer-api/user`);
  if (response.body.user) {
    injector.get(UserManagerService).setCurrentUser(response.body.user);
  }
}
