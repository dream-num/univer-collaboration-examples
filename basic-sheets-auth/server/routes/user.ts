import { ErrorCode } from "@univerjs/protocol";
import { Router } from "express";
import type { AuthenticatedUser } from "../model.js";
import { protocolUser } from "../model.js";

const OK_ERROR = { code: ErrorCode.OK, message: "" };

export function createUserRouter(): Router {
  const router = Router();
  router.get("/", (_request, response) => {
    const user = response.locals.user as AuthenticatedUser;
    response.json({
      error: OK_ERROR,
      user: protocolUser(user),
      wechat: undefined,
    });
  });
  return router;
}
