import { randomUUID } from "node:crypto";
import {
  CollabError,
  createUniverCollabServer,
  type IDatabaseAdapter,
} from "@univerjs/collaboration-server";
import { canEdit, canRead } from "./model";
import type { MemoryDocumentAccessStore } from "./memory-stores";

export function createCollaboration(
  database: IDatabaseAdapter,
  access: MemoryDocumentAccessStore
) {
  const server = createUniverCollabServer({ database });

  // Session customData 在整个连接期间保持同一引用，可在 connect 中补充。
  server.use("connect", async (ctx, next) => {
    ctx.session.customData.connectedAt = Date.now();
    await next();
  });

  // viewer/editor/admin 都可以加载 snapshot、changesets 和 blocks。
  server.use("read", async (ctx, next) => {
    const role = access.getRole(ctx.session.userId, ctx.request.unitID);
    ctx.request.customData.role = role;
    if (!canRead(role)) {
      throw new CollabError("PERMISSION_DENIED", "Cannot read this unit");
    }
    await next();
  });

  // submit 是便宜的文档级检查，发生在加载 unit 和 OT 之前。
  server.use("submit", async (ctx, next) => {
    ctx.request.customData.traceId = randomUUID();

    const role = access.getRole(ctx.session.userId, ctx.request.changeset.unitID);
    ctx.request.customData.role = role;

    if (!canEdit(role)) {
      throw new CollabError("PERMISSION_DENIED", "Unit is read-only");
    }

    await next();
  });

  // apply 在 OT 后再次查询角色，并可检查最终 mutations。
  server.use("apply", async (ctx, next) => {
    const role = access.getRole(ctx.session.userId, ctx.request.changeset.unitID);
    ctx.request.customData.role = role;
    if (!canEdit(role)) {
      throw new CollabError(
        "PERMISSION_DENIED",
        "Edit permission was revoked"
      );
    }

    // 真实系统可在这里检查保护范围或禁止某类 mutation。
    // validateMutations(ctx.session.userId, ctx.unit, ctx.changeset.mutations);
    await next();
  });

  // commit 只做应用后校验，不产生外部副作用。
  server.use("commit", async (ctx, next) => {
    // validateUpdatedUnit(ctx.unit);
    await next();
  });

  server.use("receivePresence", async (ctx, next) => {
    if (!canRead(access.getRole(ctx.session.userId, ctx.request.unitID))) {
      throw new CollabError("PERMISSION_DENIED", "Cannot send presence");
    }
    await next();
  });

  // 数据库成功提交后再做审计；listener 失败不能回滚 changeset。
  server.on("afterWrite", (event) => {
    console.info("changeset committed", {
      unitID: event.changeset.unitID,
      revision: event.changeset.revision,
      userID: event.changeset.userID,
      traceId: event.request.customData.traceId,
    });
  });

  return server;
}
