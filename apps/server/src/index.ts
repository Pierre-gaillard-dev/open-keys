import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { loadEnv } from "./config/env";
import { logger } from "./shared/logger";

const env = loadEnv();
const app = createApp(env);

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  logger.info("API listening", { port: info.port, env: env.NODE_ENV });
});
