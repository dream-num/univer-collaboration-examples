import {
  Router,
  type Request,
  type Response,
  type Router as ExpressRouter,
} from "express";
import type { User } from "../../shared/api-types";
import type { UnitRepository } from "../units/units.repository";

function readUserIds(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  return values.filter(
    (item): item is string => typeof item === "string" && item.length > 0,
  );
}

export function createCollaborationUsersRouter(options: {
  repository: UnitRepository;
  requireUser: (request: Request, response: Response) => User | undefined;
}): ExpressRouter {
  const router = Router();

  router.get("/list", (request, response) => {
    if (!options.requireUser(request, response)) return;
    const users = options.repository
      .getUsers(readUserIds(request.query.userIDs))
      .map((user) => ({
        userID: user.userId,
        name: user.displayName,
        avatar: "",
        anonymous: false,
        canBindAnonymous: false,
        phone: "",
        email: "",
        createTimestamp: user.createdAt,
      }));
    response.json({ users });
  });

  return router;
}
