import { healthResponseSchema } from "@open-keys/contracts";
import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { loadEnv } from "./config/env";

describe("GET /api/health", () => {
  it("returns the service status and version", async () => {
    const app = createApp(loadEnv({ APP_VERSION: "1.2.3" }));

    const response = await app.request("/api/health");

    expect(response.status).toBe(200);
    expect(healthResponseSchema.parse(await response.json())).toEqual({ status: "ok", version: "1.2.3" });
  });

  it("returns 404 for unknown routes", async () => {
    const app = createApp(loadEnv({}));

    const response = await app.request("/api/unknown");

    expect(response.status).toBe(404);
  });
});
