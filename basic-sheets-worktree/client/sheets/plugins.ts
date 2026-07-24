import type { IPresetPlugin } from "@univerjs/presets";
import { UniverCollaborationPlugin } from "@univerjs-pro/collaboration";
import { UniverCollaborationClientPlugin } from "@univerjs-pro/collaboration-client";
import {
  BrowserCollaborationSocketService,
  UniverCollaborationClientUIPlugin,
} from "@univerjs-pro/collaboration-client-ui";
import { createWorktreeCollaborationConfig } from "@univerjs/collaboration-worktree-client";
import { origin } from "./consts";

export function getCollaborationPlugins(
  worktreeID?: string
): IPresetPlugin[] {
  const scopeConfig = worktreeID
    ? createWorktreeCollaborationConfig({ origin, worktreeID })
    : {
        snapshotServerUrl: `${origin}/universer-api/snapshot`,
        collabSubmitChangesetUrl: `${origin}/universer-api/comb`,
        collabWebSocketUrl: `${webSocketOrigin()}/universer-api/comb/connect`,
        wsSessionTicketUrl: `${origin}/universer-api/user/session-ticket`,
      };
  return [
    UniverCollaborationPlugin,
    [
      UniverCollaborationClientPlugin,
      {
        socketService: BrowserCollaborationSocketService,
        enableOfflineEditing: true,
        enableSingleActiveInstanceLock: true,
        enableAuthServer: true,
        authzUrl: `${origin}/universer-api/authz`,
        loginUrlKey: `${origin}/universer-api/oidc/authpage`,
        sendChangesetTimeout: 200,
        ...scopeConfig,
      },
    ],
    UniverCollaborationClientUIPlugin,
  ];
}

function webSocketOrigin(): string {
  const url = new URL(origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.origin;
}
