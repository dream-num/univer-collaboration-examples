import { randomUUID } from "node:crypto";
import type {
  CollabSession,
  UniverCollabService,
} from "@univerjs-pro/collaboration-service";
import { json, Router } from "express";
import { UniverType } from "@univerjs/protocol";
import type { AuthenticatedUser } from "../model.js";
import type { ApplicationStore } from "../store.js";
import { createEmptyWorkbookData } from "../workbook-data.js";

export function createUnitRouter(dependencies: {
  readonly collabService: UniverCollabService;
  readonly store: ApplicationStore;
}): Router {
  const router = Router();
  router.post(
    "/2/unit/-/create",
    json({ limit: "1mb" }),
    async (request, response) => {
      const user = response.locals.user as AuthenticatedUser;
      const name =
        typeof request.body?.name === "string" && request.body.name.trim()
          ? request.body.name.trim().slice(0, 120)
          : "Collaborative Sheet";
      const unitID = randomUUID();
      dependencies.store.setRole(user.userId, unitID, "owner");
      try {
        await dependencies.collabService.createUnitFromData(
          {
            type: UniverType.UNIVER_SHEET,
            data: createEmptyWorkbookData(unitID, name),
          },
          {
            session: callerSession(user),
            customData: { user },
          }
        );
      } catch (error) {
        dependencies.store.removeRole(user.userId, unitID);
        throw error;
      }
      response.status(201).json({
        unitID,
        type: UniverType.UNIVER_SHEET,
        role: "owner",
      });
    }
  );
  return router;
}

function callerSession(user: AuthenticatedUser): CollabSession {
  return {
    memberId: `http-${randomUUID()}`,
    userId: user.userId,
    customData: { user },
  };
}
