import type { IPresetPlugin } from "@univerjs/presets";
import { UniverCollaborationPlugin } from "@univerjs-pro/collaboration";
import { UniverCollaborationClientPlugin } from "@univerjs-pro/collaboration-client";
import {
  BrowserCollaborationSocketService,
  UniverCollaborationClientUIPlugin,
} from "@univerjs-pro/collaboration-client-ui";
import {
  createWorktreeCollaborationConfig,
  createWorktreeMergePreviewConfig,
} from "@univerjs/collaboration-worktree-client";
import type { SaveSnapshotInput } from "@univerjs/collaboration-service";
import { origin } from "./consts";

export type CollaborationScope =
  | { readonly kind: "trunk" }
  | { readonly kind: "worktree"; readonly worktreeID: string }
  | {
      readonly kind: "merge-preview";
      readonly worktreeID: string;
      readonly preview: SaveSnapshotInput;
    };

export function getCollaborationPlugins(
  scope: CollaborationScope
): IPresetPlugin[] {
  const scopeConfig =
    scope.kind === "trunk"
      ? {
          snapshotServerUrl: `${origin}/universer-api/snapshot`,
          collabSubmitChangesetUrl: `${origin}/universer-api/comb`,
          collabWebSocketUrl: `${webSocketOrigin()}/universer-api/comb/connect`,
          wsSessionTicketUrl: `${origin}/universer-api/user/session-ticket`,
        }
      : scope.kind === "worktree"
        ? createWorktreeCollaborationConfig({
            origin,
            worktreeID: scope.worktreeID,
          })
        : createWorktreeMergePreviewConfig({
            origin,
            worktreeID: scope.worktreeID,
            preview: scope.preview,
          });
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
