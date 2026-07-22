import { randomUUID } from "node:crypto";
import {
  CollabError,
  UniverCollabService,
  type IDatabaseAdapter,
} from "@univerjs/collaboration-service";
import { canEdit, canRead } from "./model";
import type { MemoryDocumentAccessStore } from "./memory-stores";

export function createCollabService(
  database: IDatabaseAdapter,
  access: MemoryDocumentAccessStore
) {
  const collabService = new UniverCollabService({ dbAdapter: database });

  collabService.use("readUnitData", async (ctx, next) => {
    const role = access.getRole(ctx.session.userId, ctx.request.unitID);
    ctx.request.customData.role = role;
    if (!canRead(role)) {
      throw new CollabError("PERMISSION_DENIED", "Cannot read this unit");
    }
    await next();
  });

  // 便宜的文档级检查发生在 Unit load 和 OT 之前。
  collabService.use("submitChangeset", async (ctx, next) => {
    ctx.request.customData.traceId ??= randomUUID();

    const role = access.getRole(
      ctx.session.userId,
      ctx.request.changeset.unitID
    );
    ctx.request.customData.role = role;

    if (!canEdit(role)) {
      throw new CollabError("PERMISSION_DENIED", "Unit is read-only");
    }

    await next();
  });

  // OT 后再次查询角色，并检查 transformed mutations。
  collabService.use("applyChangeset", async (ctx, next) => {
    const role = access.getRole(
      ctx.session.userId,
      ctx.request.changeset.unitID
    );
    if (!canEdit(role)) {
      throw new CollabError(
        "PERMISSION_DENIED",
        "Edit permission was revoked"
      );
    }

    // validateMutations(ctx.session.userId, ctx.changeset.mutations);
    await next();
  });

  collabService.use("commitChangeset", async (_ctx, next) => {
    await next();
  });

  collabService.on("changesetCommitted", (event) => {
    console.info("changeset committed", {
      unitID: event.changeset.unitID,
      revision: event.changeset.revision,
      userID: event.changeset.userID,
      traceId: event.request.customData.traceId,
    });
  });

  return collabService;
}
