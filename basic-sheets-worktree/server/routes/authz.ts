import { json, Router } from "express";
import { ErrorCode } from "@univerjs/protocol";

export function createAuthzRouter(): Router {
  const router = Router();
  router.post(
    "/-/object/-/batch_allowed",
    json({ limit: "1mb" }),
    (request, response) => {
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
        error: { code: ErrorCode.OK, message: "" },
        objectActions: body.requests.map((item) => ({
          unitID: typeof item.unitID === "string" ? item.unitID : "",
          objectID: typeof item.objectID === "string" ? item.objectID : "",
          actions: (item.actions ?? []).map((action: unknown) => ({
            action,
            allowed: true,
          })),
        })),
      });
    }
  );
  return router;
}
