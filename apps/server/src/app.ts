import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import type { Env } from "./config/env";
import { createAuthRoutes, requireAuth } from "./features/auth";
import { createCoversRoutes } from "./features/covers";
import { createHealthRoutes } from "./features/health";
import { createImportsRoutes } from "./features/imports";
import { createLibraryRoutes } from "./features/library";
import {
  createLoopsRoutes,
  createPracticeSessionsRoutes,
  createSongPracticeRoutes,
} from "./features/practice";
import { createSongsRoutes } from "./features/songs";
import { createTagsRoutes } from "./features/tags";
import type { Services } from "./services";
import { type AppEnv, createErrorHandler, notFoundHandler, requestLogger } from "./shared/http";
import type { Logger } from "./shared/logger";

/** Every route under these prefixes requires a session: nothing can be forgotten route by route. */
export const PROTECTED_PREFIXES = [
  "/songs",
  "/imports",
  "/tags",
  "/library",
  "/loops",
  "/practice-sessions",
] as const;

export interface AppDependencies {
  readonly env: Env;
  readonly logger: Logger;
  readonly services: Services;
}

export function createApp({ env, logger, services }: AppDependencies) {
  const authenticated = requireAuth(services.auth, env.COOKIE_SECURE);

  const app = new Hono<AppEnv>()
    .basePath("/api")
    .use(requestId())
    .use(requestLogger(logger))
    .use(secureHeaders())
    // Blocks cross-site form posts (multipart uploads); JSON requests need CORS, which the API never grants.
    .use(csrf({ origin: [...env.allowedOrigins] }))
    .onError(createErrorHandler(logger))
    .notFound(notFoundHandler);

  for (const prefix of PROTECTED_PREFIXES) {
    app.use(prefix, authenticated).use(`${prefix}/*`, authenticated);
  }

  return app
    .route("/health", createHealthRoutes(env.APP_VERSION))
    .route(
      "/auth",
      createAuthRoutes(services.auth, { secureCookie: env.COOKIE_SECURE, trustProxy: env.TRUST_PROXY }),
    )
    .route("/songs", createSongsRoutes(services.songs))
    .route("/songs", createCoversRoutes(services.covers, env.MAX_COVER_SIZE))
    .route("/songs", createSongPracticeRoutes(services.practice))
    .route("/imports", createImportsRoutes(services.imports, env.MAX_MIDI_SIZE))
    .route("/tags", createTagsRoutes(services.tags))
    .route("/library", createLibraryRoutes(services.library))
    .route("/loops", createLoopsRoutes(services.practice))
    .route("/practice-sessions", createPracticeSessionsRoutes(services.practice));
}

export type AppType = ReturnType<typeof createApp>;
