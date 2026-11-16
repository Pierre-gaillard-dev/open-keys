import { Hono } from "hono";
import type { Env } from "./config/env";
import { createHealthRoutes } from "./features/health";

export function createApp(env: Env) {
  return new Hono().basePath("/api").route("/health", createHealthRoutes(env.APP_VERSION));
}

export type AppType = ReturnType<typeof createApp>;
