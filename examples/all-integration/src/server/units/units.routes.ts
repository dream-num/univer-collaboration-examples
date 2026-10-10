import { Router, type Request, type Response, type Router as ExpressRouter } from "express";
import type { User } from "../../shared/api-types";
import type { UnitsService } from "./units.service";

export function createUnitsRouter(options: {
  service: UnitsService;
  requireUser: (request: Request, response: Response) => User | undefined;
}): ExpressRouter {
  const router = Router();

  router.get("/", (request, response) => {
    const user = options.requireUser(request, response);
    if (user) response.json({ units: options.service.list(user.userId, request.query.scope) });
  });

  router.post("/", async (request, response) => {
    const user = options.requireUser(request, response);
    if (!user) return;
    const body = request.body as { type?: unknown; name?: unknown };
    const unit = await options.service.create(user.userId, body);
    response.status(201).json({ unit });
  });

  router.get("/:unitId", (request, response) => {
    const user = options.requireUser(request, response);
    if (user) response.json({ unit: options.service.get(user.userId, request.params.unitId) });
  });

  router.patch("/:unitId", (request, response) => {
    const user = options.requireUser(request, response);
    if (!user) return;
    const body = request.body as { name?: unknown };
    response.json({
      unit: options.service.rename(user.userId, request.params.unitId, body.name),
    });
  });

  router.delete("/:unitId", async (request, response) => {
    const user = options.requireUser(request, response);
    if (!user) return;
    await options.service.remove(user.userId, request.params.unitId);
    response.sendStatus(204);
  });

  router.post("/:unitId/recover", async (request, response) => {
    const user = options.requireUser(request, response);
    if (!user) return;
    const unit = await options.service.recover(user.userId, request.params.unitId);
    response.json({ unit });
  });

  return router;
}
