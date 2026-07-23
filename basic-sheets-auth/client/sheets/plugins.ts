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
import { host, httpProtocol, wsProtocol } from "./consts";

export function getCollaborationPlugins(): IPresetPlugin[] {
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
        loginUrlKey: `${httpProtocol}://${host}/`,
        sendChangesetTimeout: 200,
      },
    ],
    UniverCollaborationClientUIPlugin,
  ];
}

export function getHistoryPlugins(): IPresetPlugin[] {
  return [
    [
      UniverEditHistoryLoaderPlugin,
      {
        historyListServerUrl: `${httpProtocol}://${host}/universer-api/history`,
        univerContainerId: "app",
      },
    ],
  ];
}
