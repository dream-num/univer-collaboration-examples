import { UniverCollaborationPlugin } from "@univerjs-pro/collaboration";
import { UniverCollaborationClientPlugin } from "@univerjs-pro/collaboration-client";
import {
  BrowserCollaborationSocketService,
  UniverCollaborationClientUIPlugin,
} from "@univerjs-pro/collaboration-client-ui";
import type { Univer } from "@univerjs/core";
import type { FUniver } from "@univerjs/core/facade";
import { UniverType } from "@univerjs/protocol";

import "@univerjs-pro/collaboration-client/facade";

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
    // Images and attachments are uploaded through the application's file routes (server/files.ts).
    uploadFileServerUrl: `${baseURL}/stream/file/upload`,
    signUrlServerUrl: `${baseURL}/file/{fileID}/sign-url`,
    downloadEndpointUrl: `${location.protocol}//${location.host}/`,
  });
  univer.registerPlugin(UniverCollaborationClientUIPlugin);
}

/** Load the Unit explicitly; call this after the current user has been set. */
export async function loadCollaborativeUnit(univerAPI: FUniver, unitType: number, unitId: string) {
  const collaboration = univerAPI.getCollaboration();
  if (unitType === UniverType.UNIVER_DOC) return collaboration.loadDocAsync(unitId);
  if (unitType === UniverType.UNIVER_SHEET) return collaboration.loadSheetAsync(unitId);
  if (unitType === UniverType.UNIVER_SLIDE) return collaboration.loadSlideAsync(unitId);
  if (unitType === UniverType.UNIVER_BOARD) return collaboration.loadBoardAsync(unitId);
  if (unitType === UniverType.UNIVER_BASE) return collaboration.loadBaseAsync(unitId);
  throw new Error(`Unsupported Unit type: ${unitType}`);
}
