import { json, Router } from "express";
import { ErrorCode } from "@univerjs/protocol";

const OK_ERROR = { code: ErrorCode.OK, message: "" };

export function createAuthzRouter(): Router {
  const router = Router();

  router.post(
    "/-/object/-/batch_allowed",
    json({ limit: "1mb" }),
    (request, response) => {
      // 本 example 不实现 ACL，只为上游 Sheet 前端返回固定授权结果。
      // 生产应用应在 Service lifecycle middleware 中执行真实权限判断。
      const body = request.body as {
        readonly requests?: readonly {
          readonly unitID?: unknown;
          readonly objectID?: unknown;
          readonly actions?: readonly unknown[];
        }[];
      };
      if (!Array.isArray(body.requests)) {
        response.status(400).json({
          error: {
            code: ErrorCode.INVALID_ARGUMENT,
            message: "requests must be an array",
          },
        });
        return;
      }
      response.status(200).json({
        error: OK_ERROR,
        objectActions: body.requests.map((item) => ({
          unitID: typeof item.unitID === "string" ? item.unitID : "",
          objectID: typeof item.objectID === "string" ? item.objectID : "",
          actions: Array.isArray(item.actions)
            ? item.actions.map((action: unknown) => ({ action, allowed: true }))
            : [],
        })),
      });
    }
  );

  return router;
}
