import type { Univer } from "@univerjs/core";
import { IPermissionService } from "@univerjs/core";
import { FUniver } from "@univerjs/core/facade";
import { UniverCollaborationPlugin } from "@univerjs-pro/collaboration";
import { UniverCollaborationClientPlugin } from "@univerjs-pro/collaboration-client";
import "@univerjs-pro/collaboration-client/facade";
import {
  BrowserCollaborationSocketService,
  UniverCollaborationClientUIPlugin,
} from "@univerjs-pro/collaboration-client-ui";
import { WorkbookEditablePermission } from "@univerjs/sheets";
import { getDocumentRole } from "./auth";

/** 假设 Univer 已注册 Sheet、UI、Render 等产品插件。 */
export function registerCollaboration(univer: Univer): void {
  const websocketOrigin = location.origin.replace(/^http/, "ws");

  univer.registerPlugin(UniverCollaborationPlugin);
  univer.registerPlugin(UniverCollaborationClientPlugin, {
    socketService: BrowserCollaborationSocketService,
    enableOfflineEditing: false,
    enableSingleActiveInstanceLock: false,

    // 同源 URL 使 HTTP 和 WebSocket 自动携带登录 Cookie。
    snapshotServerUrl: "/universer-api/snapshot",
    collabSubmitChangesetUrl: "/universer-api/comb",
    collabWebSocketUrl: `${websocketOrigin}/universer-api/comb/connect`,
    wsSessionTicketUrl: "/universer-api/user/session-ticket",
    authzUrl: "/universer-api/authz",
  });
  univer.registerPlugin(UniverCollaborationClientUIPlugin);
}

export async function openCollaborativeSheet(
  univer: Univer,
  unitId: string
): Promise<void> {
  const api = FUniver.newAPI(univer);
  const workbook = await api.getCollaboration().loadSheetAsync(unitId);
  if (!workbook) throw new Error(`Cannot open unit ${unitId}`);

  const role = await getDocumentRole(unitId);
  if (role === "viewer") {
    // 前端只读是 UX；服务端 submit/apply middleware 才是安全边界。
    const permissions = univer.__getInjector().get(IPermissionService);
    const editable = new WorkbookEditablePermission(unitId);
    if (!permissions.getPermissionPoint(editable.id)) {
      permissions.addPermissionPoint(editable);
    }
    permissions.updatePermissionPoint(editable.id, false);
  }
}
