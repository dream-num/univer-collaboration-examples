import type { ErrorRequestHandler, RequestHandler } from "express";
import { CollabError } from "@univerjs-pro/collaboration-service";
import { WorktreeError } from "@univerjs-pro/collaboration-worktree-service";

export const notFoundHandler: RequestHandler = (_request, response) => {
  response.status(404).json({
    error: { code: "NOT_FOUND", message: "Route not found" },
  });
};

export const errorHandler: ErrorRequestHandler = (
  error,
  _request,
  response,
  _next
) => {
  if (error instanceof CollabError || error instanceof WorktreeError) {
    response.status(400).json({
      error: {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      },
    });
    return;
  }
  console.error(error);
  response.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Internal server error" },
  });
};
