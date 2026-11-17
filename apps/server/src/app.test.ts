import { errorResponseSchema, healthResponseSchema } from "@open-keys/contracts";
import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { loadEnv } from "./config/env";
import { createMemoryLogger } from "./test/memory-logger";

function appUnderTest(env: NodeJS.ProcessEnv = {}) {
  const { logger } = createMemoryLogger();
  return createApp({ env: loadEnv(env), logger });
}

describe("GET /api/health", () => {
  it("returns the service status and version", async () => {
    const response = await appUnderTest({ APP_VERSION: "1.2.3" }).request("/api/health");

    expect(response.status).toBe(200);
    expect(healthResponseSchema.parse(await response.json())).toEqual({ status: "ok", version: "1.2.3" });
  });

  it("sends security headers and a request id", async () => {
    const response = await appUnderTest().request("/api/health");

    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("X-Request-Id")).toBeTruthy();
  });
});

describe("unknown API routes", () => {
  it("return a NOT_FOUND error body", async () => {
    const response = await appUnderTest().request("/api/unknown");

    expect(response.status).toBe(404);
    expect(errorResponseSchema.parse(await response.json()).error.code).toBe("NOT_FOUND");
  });
});
