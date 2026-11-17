import { Hono } from "hono";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import type { Env } from "./config/env";
import { createHealthRoutes } from "./features/health";
import { type AppEnv, createErrorHandler, notFoundHandler, requestLogger } from "./shared/http";
import type { Logger } from "./shared/logger";

export interface AppDependencies {
  readonly env: Env;
  readonly logger: Logger;
}

export function createApp({ env, logger }: AppDependencies) {
  return new Hono<AppEnv>()
    .basePath("/api")
    .use(requestId())
    .use(requestLogger(logger))
    .use(secureHeaders())
    .onError(createErrorHandler(logger))
    .notFound(notFoundHandler)
    .route("/health", createHealthRoutes(env.APP_VERSION));
}

export type AppType = ReturnType<typeof createApp>;
