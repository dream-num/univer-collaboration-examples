import { CollabError } from "@univerjs/collaboration-service";
import { ErrorCode } from "@univerjs/protocol";
import type { ErrorRequestHandler, RequestHandler } from "express";

export const notFoundHandler: RequestHandler = (_request, response) => {
  response.status(404).json({
    error: { code: ErrorCode.NOT_FOUND, message: "Not Found" },
  });
};

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  _request,
  response,
  _next
) => {
  if (error instanceof CollabError) {
    const status =
      error.code === "UNIT_NOT_FOUND"
        ? 404
        : error.code === "UNAUTHENTICATED"
          ? 401
        : error.code === "PERMISSION_DENIED"
          ? 403
          : 400;
    response.status(status).json({
      error: { code: protocolCode(error), message: error.message },
    });
    return;
  }
  console.error(error);
  response.status(500).json({
    error: {
      code: ErrorCode.INTERNAL_ERROR,
      message: "Internal server error",
    },
  });
};

function protocolCode(error: CollabError): ErrorCode {
  switch (error.code) {
    case "UNIT_NOT_FOUND":
      return ErrorCode.NOT_FOUND;
    case "PERMISSION_DENIED":
      return ErrorCode.PERMISSION_DENIED;
    case "UNAUTHENTICATED":
      return ErrorCode.UNAUTHENTICATED;
    case "INVALID_REQUEST":
    case "REVISION_MISMATCH":
    case "OT_CONFLICT":
      return ErrorCode.INVALID_ARGUMENT;
    case "ADAPTER_FAILURE":
    case "INTERNAL_ERROR":
      return ErrorCode.INTERNAL_ERROR;
  }
}
