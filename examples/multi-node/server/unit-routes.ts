import express, { type Router } from "express";
import type { UnitService } from "./unit-service.js";

export function createUnitRouter(units: UnitService, userID: string, nodeID: string): Router {
  const router = express.Router();
  router.get("/", async (_request, response) => {
    response.json({ units: await units.listUnits() });
  });
  router.post("/", express.json({ limit: "4kb" }), async (request, response) => {
    const name: unknown = request.body?.name;
    if (typeof name !== "string" || !name.trim() || name.trim().length > 80) {
      response.status(400).json({ error: "Enter a file name between 1 and 80 characters." });
      return;
    }
    const unit = await units.createUnit(name.trim(), userID);
    if (!unit) {
      response.status(409).json({ error: "Could not allocate a new Unit ID. Please try again." });
      return;
    }
    console.info(`[${nodeID}] unit.created unitID=${unit.unitID}`);
    response.setHeader("X-Collab-Node", nodeID);
    response.status(201).json({ unit });
  });
  return router;
}
