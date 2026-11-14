import { randomUUID } from "node:crypto";
import { CollabError, type IUniverCollabService } from "@univerjs-pro/collaboration-service";
import express, { type ErrorRequestHandler, type Router } from "express";
import { isUnitType, UNIT_TYPES, type CreateUnitResponse, type UnitsResponse } from "../shared/units";
import type { UnitCatalog } from "./database/unit-catalog";
import { DEMO_USER, initialData } from "./units";

export function createUnitRouter(catalog: UnitCatalog, service: IUniverCollabService): Router {
  const router = express.Router();
  router.use((_request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    next();
  });
  router.get("/", async (_request, response) => {
    response.json({ units: catalog.listUnits(), user: DEMO_USER } satisfies UnitsResponse);
  });
  router.post("/", express.json({ limit: "16kb" }), async (request, response) => {
    const body: unknown = request.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new CollabError("INVALID_REQUEST", "A Unit type and name are required");
    }
    const { type, name: rawName } = body as Record<string, unknown>;
    if (!isUnitType(type)) throw new CollabError("INVALID_REQUEST", "Choose a supported Unit type");
    if (rawName !== undefined && typeof rawName !== "string") {
      throw new CollabError("INVALID_REQUEST", "Unit name must be text");
    }
    const name = (rawName as string | undefined)?.trim() || UNIT_TYPES.find((item) => item.type === type)!.defaultName;
    if (name.length > 120) throw new CollabError("INVALID_REQUEST", "Unit name must be 120 characters or fewer");

    const unitId = randomUUID();
    await service.createUnitFromData({
      ...initialData({ unitId, type, name }), metadata: { name, origin: "create" },
    }, { userID: DEMO_USER.userId });
    const unit = catalog.getUnitSummary(unitId);
    if (!unit) throw new Error("The created Unit is missing from the application catalog");
    response.status(201).json({ unit } satisfies CreateUnitResponse);
  });

  const handleError: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
    if (error instanceof CollabError) {
      const status = error.code === "INVALID_REQUEST" ? 400
        : error.code === "UNIT_NOT_FOUND" ? 404
        : error.code === "UNAUTHENTICATED" ? 401
        : error.code === "PERMISSION_DENIED" || error.code.startsWith("LICENSE_") ? 403
        : 500;
      response.status(status).json({ error: { message: status === 500 ? "Unable to save the Unit" : error.message } });
      if (status === 500) console.error(error);
      return;
    }
    if (error && typeof error === "object" && "type" in error &&
      (error.type === "entity.parse.failed" || error.type === "entity.too.large")) {
      response.status(error.type === "entity.too.large" ? 413 : 400).json({ error: { message: "Invalid create request" } });
      return;
    }
    console.error(error);
    response.status(500).json({ error: { message: "Unable to load or save Units" } });
  };
  router.use(handleError);
  return router;
}
