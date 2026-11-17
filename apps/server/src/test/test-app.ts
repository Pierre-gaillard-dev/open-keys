import { Hono } from "hono";
import { requestId } from "hono/request-id";
import { type AppEnv, createErrorHandler, notFoundHandler, requestLogger } from "../shared/http";
import type { Logger } from "../shared/logger";

/** Bare app with the same cross-cutting middlewares as the real one, to test them in isolation. */
export function createTestApp(logger: Logger) {
  return new Hono<AppEnv>()
    .use(requestId())
    .use(requestLogger(logger))
    .onError(createErrorHandler(logger))
    .notFound(notFoundHandler);
}
