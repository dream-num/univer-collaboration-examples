import { UniverCollaborationPlugin } from "@univerjs-pro/collaboration";
import { UniverCollaborationClientPlugin } from "@univerjs-pro/collaboration-client";
import {
  BrowserCollaborationSocketService,
  UniverCollaborationClientUIPlugin,
} from "@univerjs-pro/collaboration-client-ui";
import type { Univer } from "@univerjs/core";

export function registerCollaboration(univer: Univer, baseURL: string) {
  univer.registerPlugin(UniverCollaborationPlugin);
  univer.registerPlugin(UniverCollaborationClientPlugin, {
    socketService: BrowserCollaborationSocketService,
    sendChangesetTimeout: 200,
    authzUrl: `${baseURL}/authz`,
    snapshotServerUrl: `${baseURL}/snapshot`,
    collabSubmitChangesetUrl: `${baseURL}/comb`,
    collabWebSocketUrl: `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/universer-api/comb/connect`,
    wsSessionTicketUrl: `${baseURL}/user/session-ticket`,
  });
  univer.registerPlugin(UniverCollaborationClientUIPlugin);
}
