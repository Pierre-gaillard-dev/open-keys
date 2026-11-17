import type { ErrorCode, ErrorResponse } from "@open-keys/contracts";
import type { Context, ErrorHandler, NotFoundHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Logger } from "../logger";
import type { AppEnv } from "./app-env";
import { AppError, errorCodeOfStatus } from "./errors";

const GENERIC_INTERNAL_MESSAGE = "An unexpected error occurred";

function errorResponse(
  c: Context<AppEnv>,
  status: ContentfulStatusCode,
  code: ErrorCode,
  message: string,
  details?: unknown,
) {
  const body: ErrorResponse = {
    error: { code, message, requestId: c.var.requestId, ...(details === undefined ? {} : { details }) },
  };
  return c.json(body, status);
}

/** Converts every thrown error into the API error format. Unexpected errors never leak their message. */
export function createErrorHandler(fallbackLogger: Logger): ErrorHandler<AppEnv> {
  return (error, c) => {
    const logger = c.var.logger ?? fallbackLogger;
    if (error instanceof AppError) {
      if (error.status >= 500) {
        logger.error("Application error", { error, code: error.code });
      }
      for (const [name, value] of Object.entries(error.headers)) {
        c.header(name, value);
      }
      return errorResponse(c, error.status, error.code, error.message, error.details);
    }
    if (error instanceof HTTPException) {
      const status = error.status >= 400 ? error.status : 500;
      return errorResponse(c, status, errorCodeOfStatus(status), error.message || "Request failed");
    }
    logger.error("Unhandled error", { error });
    return errorResponse(c, 500, "INTERNAL_ERROR", GENERIC_INTERNAL_MESSAGE);
  };
}

export const notFoundHandler: NotFoundHandler<AppEnv> = (c) =>
  errorResponse(c, 404, "NOT_FOUND", `Route ${c.req.method} ${c.req.path} not found`);
