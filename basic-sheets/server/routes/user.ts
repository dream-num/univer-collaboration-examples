import { Router } from "express";
import { ErrorCode } from "@univerjs/protocol";
import type { DemoUser } from "../demo-user.js";
import { protocolUser } from "../demo-user.js";

const OK_ERROR = { code: ErrorCode.OK, message: "" };

export interface UserRouterDependencies {
  readonly user: DemoUser;
}

export function createUserRouter(
  dependencies: UserRouterDependencies
): Router {
  const router = Router();

  router.get("/", (_request, response) => {
    response.status(200).json({
      error: OK_ERROR,
      user: protocolUser(dependencies.user),
      wechat: undefined,
    });
  });

  return router;
}
