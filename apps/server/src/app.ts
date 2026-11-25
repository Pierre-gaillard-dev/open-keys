import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import type { Env } from "./config/env";
import { createInvitationsRoutes, createInviteRoutes, createUsersRoutes } from "./features/accounts";
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
import { createSongAudioRoutes, createSongsRoutes } from "./features/songs";
import { createSourcesRoutes } from "./features/sources";
import { createTagsRoutes } from "./features/tags";
import { createIntegrationRoutes, createTranscriptionsRoutes } from "./features/transcriptions";
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
  "/sources",
  "/users",
  "/invitations",
  "/transcriptions",
] as const;

export interface AppDependencies {
  readonly env: Env;
  readonly logger: Logger;
  readonly services: Services;
  /** How recordings of the audio source are relayed to the player (D35): fetch, or a fake in tests. */
  readonly audioFetch?: typeof fetch;
}

export function createApp({ env, logger, services, audioFetch }: AppDependencies) {
  const authenticated = requireAuth(services.auth, env.COOKIE_SECURE);
  // The other app (D35): its own key instead of a session, only when configured.
  const integration =
    env.INTEGRATION_TOKEN && env.INTEGRATION_USERNAME
      ? createIntegrationRoutes({
          transcriptions: services.transcriptions,
          auth: services.auth,
          token: env.INTEGRATION_TOKEN,
          username: env.INTEGRATION_USERNAME,
          publicUrl: env.PUBLIC_URL,
        })
      : new Hono<AppEnv>();

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
    .route("/invite", createInviteRoutes(services.accounts, env.COOKIE_SECURE))
    .route("/users", createUsersRoutes(services.accounts))
    .route("/invitations", createInvitationsRoutes(services.accounts))
    .route("/songs", createSongsRoutes(services.songs))
    .route(
      "/songs",
      createSongAudioRoutes({
        songs: services.songs,
        audioSources: env.AUDIO_SOURCES,
        ...(audioFetch ? { fetch: audioFetch } : {}),
      }),
    )
    .route("/songs", createCoversRoutes(services.covers, env.MAX_COVER_SIZE))
    .route("/songs", createSongPracticeRoutes(services.practice))
    .route("/imports", createImportsRoutes(services.imports, env.MAX_MIDI_SIZE))
    .route("/tags", createTagsRoutes(services.tags))
    .route("/library", createLibraryRoutes(services.library))
    .route("/loops", createLoopsRoutes(services.practice))
    .route("/practice-sessions", createPracticeSessionsRoutes(services.practice))
    .route("/sources", createSourcesRoutes(services.sources))
    .route("/transcriptions", createTranscriptionsRoutes(services.transcriptions, env.MAX_AUDIO_SIZE))
    .route("/integrations", integration);
}

export type AppType = ReturnType<typeof createApp>;
