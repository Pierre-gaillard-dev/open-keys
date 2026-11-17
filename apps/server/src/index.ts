import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { loadEnv } from "./config/env";
import { createLogger } from "./shared/logger";

const SHUTDOWN_TIMEOUT_MS = 10_000;

const env = loadEnv();
const logger = createLogger({ level: env.LOG_LEVEL, context: { service: "api" } });
const app = createApp({ env, logger });

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  logger.info("API listening", { port: info.port, env: env.NODE_ENV, version: env.APP_VERSION });
});

function shutdown(signal: string): void {
  logger.info("Shutting down", { signal });
  setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();
  server.close((error) => {
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
