import { randomUUID } from "node:crypto";
import type {
  CollabSession,
  UniverCollabService,
} from "@univerjs-pro/collaboration-service";
import { json, Router } from "express";
import { UniverType } from "@univerjs/protocol";
import type { DemoUser } from "../demo-user.js";
import { createEmptyWorkbookData } from "../workbook-data.js";

export interface UnitRouterDependencies {
  readonly collabService: UniverCollabService;
  readonly user: DemoUser;
}

export function createUnitRouter(
  dependencies: UnitRouterDependencies
): Router {
  const router = Router();

  router.post(
    "/2/unit/-/create",
    json({ limit: "1mb" }),
    async (request, response) => {
      const body = request.body as { readonly name?: unknown };
      const name =
        typeof body.name === "string" && body.name.trim()
          ? body.name.trim().slice(0, 120)
          : "Collaborative Sheet";
      const unitID = randomUUID();
      const data = createEmptyWorkbookData(unitID, name);

      await dependencies.collabService.createUnitFromData(
        { type: UniverType.UNIVER_SHEET, data },
        {
          session: callerSession(dependencies.user),
          customData: { user: dependencies.user },
        }
      );
      response.status(201).json({ unitID, type: UniverType.UNIVER_SHEET });
    }
  );

  return router;
}

function callerSession(user: DemoUser): CollabSession {
  return {
    memberId: `http-${randomUUID()}`,
    userId: user.userId,
    customData: { user },
  };
}
