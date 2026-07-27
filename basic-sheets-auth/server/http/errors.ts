import { CollabError } from "@univerjs-pro/collaboration-service";
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
  const failure = httpFailure(error);
  response.status(failure.status).json({
    error: { code: failure.code, message: failure.message },
  });
};

function httpFailure(error: unknown) {
  if (isInvalidJson(error)) {
    return {
      status: 400,
      code: ErrorCode.INVALID_ARGUMENT,
      message: "Request body must be valid JSON",
    };
  }
  if (!(error instanceof CollabError)) {
    console.error(error);
    return {
      status: 500,
      code: ErrorCode.INTERNAL_ERROR,
      message: "Internal server error",
    };
  }
  switch (error.code) {
    case "UNAUTHENTICATED":
      return { status: 401, code: ErrorCode.UNAUTHENTICATED, message: error.message };
    case "PERMISSION_DENIED":
      return { status: 403, code: ErrorCode.PERMISSION_DENIED, message: error.message };
    case "UNIT_NOT_FOUND":
      return { status: 404, code: ErrorCode.NOT_FOUND, message: error.message };
    case "ADAPTER_FAILURE":
      return { status: 503, code: ErrorCode.INTERNAL_ERROR, message: error.message };
    case "INTERNAL_ERROR":
      return { status: 500, code: ErrorCode.INTERNAL_ERROR, message: error.message };
    case "INVALID_REQUEST":
    case "REVISION_MISMATCH":
    case "OT_CONFLICT":
      return { status: 400, code: ErrorCode.INVALID_ARGUMENT, message: error.message };
  }
}

function isInvalidJson(error: unknown): boolean {
  if (!(error instanceof SyntaxError)) return false;
  const candidate = error as SyntaxError & {
    readonly status?: unknown;
    readonly type?: unknown;
  };
  return candidate.status === 400 && candidate.type === "entity.parse.failed";
}
