import {
  Router,
  type Request,
  type Response,
  type Router as ExpressRouter,
} from "express";
import type { User } from "../../shared/api-types";
import type { MembersService } from "./members.service";

interface UnitParams {
  [key: string]: string;
  unitId: string;
}

interface MemberParams extends UnitParams {
  username: string;
}

export function createMembersRouter(options: {
  service: MembersService;
  requireUser: (request: Request, response: Response) => User | undefined;
}): ExpressRouter {
  const router = Router({ mergeParams: true });

  router.get<UnitParams>("/", (request, response) => {
    const user = options.requireUser(request, response);
    if (user) {
      response.json({
        members: options.service.list(user.userId, request.params.unitId),
      });
    }
  });

  router.put<MemberParams>("/:username", async (request, response) => {
    const user = options.requireUser(request, response);
    if (!user) return;
    const body = request.body as { role?: unknown };
    const member = await options.service.set(
      user.userId,
      request.params.unitId,
      request.params.username,
      body.role,
    );
    response.json({ member });
  });

  router.delete<MemberParams>("/:username", async (request, response) => {
    const user = options.requireUser(request, response);
    if (!user) return;
    await options.service.remove(
      user.userId,
      request.params.unitId,
      request.params.username,
    );
    response.sendStatus(204);
  });

  return router;
}
