import type { Univer } from "@univerjs/core";
import { grantDocumentRole, login } from "./auth";
import { openCollaborativeSheet, registerCollaboration } from "./univer";

export async function start(univer: Univer, unitId: string): Promise<void> {
  // 1. 登录响应写入 HttpOnly JWT Cookie。
  await login("alice", "alice-password");

  // 2. 在加载任何协同 unit 前注册插件。
  registerCollaboration(univer);

  // 3. HTTP snapshot 与 WebSocket handshake 自动携带登录 Cookie。
  await openCollaborativeSheet(univer, unitId);

  // 4. 当前用户是 admin 时，可以通过业务 API 为 user-bob 授予 editor。
  await grantDocumentRole(unitId, "user-bob", "editor");
}
