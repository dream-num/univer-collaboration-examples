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
import { createWorktreeCollaborationConfig } from "@univerjs/collaboration-worktree-client";
import { origin } from "./consts";

export function getCollaborationPlugins(
  worktreeID: string
): IPresetPlugin[] {
  const worktreeConfig = createWorktreeCollaborationConfig({
    origin,
    worktreeID,
    override: [
      [
        ISingleActiveUnitService,
        { useClass: WebBrowserSingleActiveUnitService },
      ],
    ],
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
        ...worktreeConfig,
      },
    ],
    UniverCollaborationClientUIPlugin,
  ];
}
