import { describe, expect, it } from "vitest";
import { createMemoryLogger } from "../../test/memory-logger";
import { createTestApp } from "../../test/test-app";

describe("requestLogger", () => {
  it("logs one access entry with method, path, status, duration and request id", async () => {
    const { logger, entries } = createMemoryLogger();
    const app = createTestApp(logger).get("/songs", (c) => c.json([]));

    const response = await app.request("/songs");

    const requestId = response.headers.get("X-Request-Id");
    expect(requestId).toBeTruthy();
    const access = entries.filter((e) => e.entry["message"] === "request");
    expect(access).toHaveLength(1);
    expect(access[0]?.level).toBe("info");
    expect(access[0]?.entry).toMatchObject({ method: "GET", path: "/songs", status: 200, requestId });
    expect(typeof access[0]?.entry["durationMs"]).toBe("number");
  });

  it("logs client errors as warnings and server errors as errors", async () => {
    const { logger, entries } = createMemoryLogger();
    const app = createTestApp(logger).get("/crash", () => {
      throw new Error("boom");
    });

    await app.request("/missing");
    await app.request("/crash");

    const access = entries.filter((e) => e.entry["message"] === "request");
    expect(access.map((e) => [e.entry["status"], e.level])).toEqual([
      [404, "warn"],
      [500, "error"],
    ]);
  });

  it("logs the health check at debug level only", async () => {
    const { logger, entries } = createMemoryLogger();
    const app = createTestApp(logger).get("/api/health", (c) => c.json({ status: "ok" }));

    await app.request("/api/health");

    expect(entries.find((e) => e.entry["message"] === "request")?.level).toBe("debug");
  });
});
