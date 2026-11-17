import { join } from "node:path";
import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { loadEnv } from "./config/env";
import { openDatabase } from "./db";
import { createPasswordHasher } from "./features/auth";
import { createMusicBrainzProvider, createWikidataProvider, type HttpGet } from "./features/covers";
import { createMutopiaSource } from "./features/mutopia";
import { createServices } from "./services";
import { createSafeFetch } from "./shared/http";
import { startPeriodicJob } from "./shared/jobs/periodic-job";
import { createLogger } from "./shared/logger";
import { createIdGenerator, systemClock } from "./shared/runtime";
import { createFileStorage } from "./shared/storage";

const SHUTDOWN_TIMEOUT_MS = 10_000;
const MAINTENANCE_INTERVAL_MS = 60 * 60_000;
/** The Mutopia index is checked every 6 hours and synchronised when older than a week. */
const MUTOPIA_CHECK_INTERVAL_MS = 6 * 60 * 60_000;

const env = loadEnv();
const logger = createLogger({ level: env.LOG_LEVEL, context: { service: "api" } });
const userAgent = `OpenKeys/${env.APP_VERSION} ( ${env.MUSICBRAINZ_CONTACT} )`;
/** Known public sites (MusicBrainz, Wikimedia, Mutopia): plain fetch with an identifying User-Agent. */
const apiGet: HttpGet = (url, init) => fetch(url, { ...init, headers: { "User-Agent": userAgent } });

const storage = await createFileStorage(env.DATA_DIR);
const database = openDatabase(join(env.DATA_DIR, "open-keys.db"));
const services = createServices({
  env,
  logger,
  db: database.db,
  storage,
  clock: systemClock,
  newId: createIdGenerator(),
  safeFetch: createSafeFetch({ userAgent }),
  hasher: createPasswordHasher(),
  coverProviders: [createMusicBrainzProvider(apiGet), createWikidataProvider(apiGet)],
  mutopiaSource: createMutopiaSource(apiGet),
});

if (env.ADMIN_USERNAME && env.ADMIN_PASSWORD) {
  await services.auth.ensureInitialUser(env.ADMIN_USERNAME, env.ADMIN_PASSWORD);
} else if (!services.auth.hasUsers()) {
  logger.warn("No user yet: set ADMIN_USERNAME and ADMIN_PASSWORD to create the initial account");
}

const app = createApp({ env, logger, services });
const maintenance = startPeriodicJob(
  "maintenance",
  MAINTENANCE_INTERVAL_MS,
  () => services.maintenance.run(),
  logger,
);

const mutopiaSync = startPeriodicJob(
  "mutopia-sync",
  MUTOPIA_CHECK_INTERVAL_MS,
  () => services.mutopia.syncIfStale(),
  logger,
);

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  logger.info("API listening", { port: info.port, env: env.NODE_ENV, version: env.APP_VERSION });
});

function shutdown(signal: string): void {
  logger.info("Shutting down", { signal });
  maintenance.stop();
  mutopiaSync.stop();
  setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();
  server.close((error) => {
    database.close();
    if (error) {
      logger.error("Error while closing the server", { error });
      process.exit(1);
    }
    process.exit(0);
  });
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection", { error: reason });
});
