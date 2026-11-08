import { UniverCollaborationClientPlugin } from "@univerjs-pro/collaboration-client";
import {
  BrowserCollaborationSocketService,
  UniverCollaborationClientUIPlugin,
} from "@univerjs-pro/collaboration-client-ui";
import type { Univer } from "@univerjs/core";
import { collaborationClientConfig } from "./config";

import "@univerjs-pro/collaboration-client/facade";

/**
 * The collaboration client, registered by each Unit type after its UI plugins; the core
 * collaboration plugin is registered in `createUniver`.
 */
export function registerCollaborationClient(univer: Univer) {
  univer.registerPlugin(UniverCollaborationClientPlugin, {
    socketService: BrowserCollaborationSocketService,
    ...collaborationClientConfig,
  });
  univer.registerPlugin(UniverCollaborationClientUIPlugin);
}
