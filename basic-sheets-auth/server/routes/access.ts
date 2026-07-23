import { CollabError } from "@univerjs/collaboration-service";
import { json, Router } from "express";
import type { AuthenticatedUser, UnitRole } from "../model.js";
import { canManageMembers, canRead } from "../model.js";
import type { ApplicationStore } from "../store.js";

export function createAccessRouter(store: ApplicationStore): Router {
  const router = Router();
  router.use(json({ limit: "32kb" }));

  router.get("/:unitID/access", (request, response) => {
    const user = response.locals.user as AuthenticatedUser;
    const role = store.getRole(user.userId, request.params.unitID);
    if (!canRead(role)) {
      throw new CollabError("PERMISSION_DENIED", "Cannot read this unit");
    }
    response.json({ role });
  });

  router.get("/:unitID/members", (request, response) => {
    const user = response.locals.user as AuthenticatedUser;
    const role = store.getRole(user.userId, request.params.unitID);
    if (!canRead(role)) {
      throw new CollabError("PERMISSION_DENIED", "Cannot read this unit");
    }
    response.json({ role, members: store.listMembers(request.params.unitID) });
  });

  router.put("/:unitID/members/:userID", (request, response) => {
    const actor = response.locals.user as AuthenticatedUser;
    const actorRole = store.getRole(actor.userId, request.params.unitID);
    if (!canManageMembers(actorRole)) {
      throw new CollabError(
        "PERMISSION_DENIED",
        "Only the owner can manage members"
      );
    }
    const target = store.getUser(request.params.userID);
    if (!target) throw new CollabError("UNIT_NOT_FOUND", "User not found");
    if (request.params.userID === actor.userId) {
      throw new CollabError(
        "INVALID_REQUEST",
        "The owner role cannot be changed"
      );
    }
    const role = memberRole(request.body?.role);
    store.setRole(target.userId, request.params.unitID, role);
    response.json({ member: { user: target, role } });
  });

  router.delete("/:unitID/members/:userID", (request, response) => {
    const actor = response.locals.user as AuthenticatedUser;
    const actorRole = store.getRole(actor.userId, request.params.unitID);
    if (!canManageMembers(actorRole)) {
      throw new CollabError(
        "PERMISSION_DENIED",
        "Only the owner can manage members"
      );
    }
    if (request.params.userID === actor.userId) {
      throw new CollabError("INVALID_REQUEST", "The owner cannot be removed");
    }
    store.removeRole(request.params.userID, request.params.unitID);
    response.status(204).end();
  });

  return router;
}

function memberRole(value: unknown): Exclude<UnitRole, "owner"> {
  if (value === "editor" || value === "viewer") return value;
  throw new CollabError("INVALID_REQUEST", "role must be editor or viewer");
}
