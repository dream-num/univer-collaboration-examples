import { CollabError } from "@univerjs/collaboration-service";
import { ErrorCode } from "@univerjs/protocol";
import { json, Router } from "express";
import type { AuthenticatedUser } from "../model.js";
import { isUnitActionAllowed } from "../model.js";
import type { ApplicationStore } from "../store.js";

const OK_ERROR = { code: ErrorCode.OK, message: "" };

export function createAuthzRouter(store: ApplicationStore): Router {
  const router = Router();
  router.post(
    "/-/object/-/batch_allowed",
    json({ limit: "1mb" }),
    (request, response) => {
      const requests = request.body?.requests as unknown;
      if (!Array.isArray(requests)) {
        throw new CollabError("INVALID_REQUEST", "requests must be an array");
      }
      const user = response.locals.user as AuthenticatedUser;
      response.json({
        error: OK_ERROR,
        objectActions: requests.map((item: unknown) => {
          const candidate = item as {
            readonly unitID?: unknown;
            readonly objectID?: unknown;
            readonly actions?: unknown;
          };
          const unitID =
            typeof candidate.unitID === "string" ? candidate.unitID : "";
          const role = store.getRole(user.userId, unitID);
          return {
            unitID,
            objectID:
              typeof candidate.objectID === "string" ? candidate.objectID : "",
            actions: Array.isArray(candidate.actions)
              ? candidate.actions.map((action) => ({
                  action,
                  allowed: isUnitActionAllowed(role, action),
                }))
              : [],
          };
        }),
      });
    }
  );
  return router;
}
