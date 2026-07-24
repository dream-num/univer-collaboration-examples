import { Router } from "express";
import { ErrorCode } from "@univerjs/protocol";
import type { DemoUser } from "../demo-user.js";
import { protocolUser } from "../demo-user.js";

export function createUserRouter(user: DemoUser): Router {
  const router = Router();
  router.get("/", (_request, response) => {
    response.status(200).json({
      error: { code: ErrorCode.OK, message: "" },
      user: protocolUser(user),
      wechat: undefined,
    });
  });
  return router;
}
