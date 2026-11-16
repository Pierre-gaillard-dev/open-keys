import type { HealthResponse } from "@open-keys/contracts";
import { Hono } from "hono";

export function createHealthRoutes(version: string) {
  return new Hono().get("/", (c) => c.json<HealthResponse>({ status: "ok", version }));
}
