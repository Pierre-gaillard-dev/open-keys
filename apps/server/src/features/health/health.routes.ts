import type { HealthResponse } from "@open-keys/contracts";
import { Hono } from "hono";
import type { AppEnv } from "../../shared/http";

export function createHealthRoutes(version: string) {
  return new Hono<AppEnv>().get("/", (c) => c.json<HealthResponse>({ status: "ok", version }));
}
