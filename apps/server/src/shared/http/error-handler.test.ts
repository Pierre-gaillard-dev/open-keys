import { errorResponseSchema } from "@open-keys/contracts";
import { HTTPException } from "hono/http-exception";
import { describe, expect, it } from "vitest";
import { createMemoryLogger } from "../../test/memory-logger";
import { createTestApp } from "../../test/test-app";
import { AppError } from "./errors";

async function errorBody(response: Response) {
  return errorResponseSchema.parse(await response.json()).error;
}

describe("error handler", () => {
  it("returns AppError code, message, details and request id", async () => {
    const { logger } = createMemoryLogger();
    const app = createTestApp(logger).get("/conflict", () => {
      throw new AppError("CONFLICT", "Song already exists", { details: { songId: "s1" } });
    });

    const response = await app.request("/conflict", { headers: { "X-Request-Id": "req-123" } });

    expect(response.status).toBe(409);
    expect(await errorBody(response)).toEqual({
      code: "CONFLICT",
      message: "Song already exists",
      requestId: "req-123",
      details: { songId: "s1" },
    });
  });

  it("maps Hono HTTP exceptions to an error code", async () => {
    const { logger } = createMemoryLogger();
    const app = createTestApp(logger).get("/too-big", () => {
      throw new HTTPException(413, { message: "Body too large" });
    });

    const response = await app.request("/too-big");

    expect(response.status).toBe(413);
    expect(await errorBody(response)).toMatchObject({ code: "PAYLOAD_TOO_LARGE", message: "Body too large" });
  });

  it("hides unexpected errors from the client and logs them", async () => {
    const { logger, entries } = createMemoryLogger();
    const app = createTestApp(logger).get("/crash", () => {
      throw new Error("database password is hunter2");
    });

    const response = await app.request("/crash");
    const body = await errorBody(response);

    expect(response.status).toBe(500);
    expect(body).toMatchObject({ code: "INTERNAL_ERROR", message: "An unexpected error occurred" });
    expect(JSON.stringify(body)).not.toContain("hunter2");
    const logged = entries.find((e) => e.entry["message"] === "Unhandled error");
    expect(logged?.level).toBe("error");
    expect(logged?.entry["requestId"]).toBe(body.requestId);
  });

  it("answers unknown routes with a NOT_FOUND error", async () => {
    const { logger } = createMemoryLogger();

    const response = await createTestApp(logger).request("/nope", { method: "DELETE" });

    expect(response.status).toBe(404);
    expect(await errorBody(response)).toMatchObject({
      code: "NOT_FOUND",
      message: "Route DELETE /nope not found",
    });
  });
});
