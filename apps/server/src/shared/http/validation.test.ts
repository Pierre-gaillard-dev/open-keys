import { errorResponseSchema } from "@open-keys/contracts";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createMemoryLogger } from "../../test/memory-logger";
import { createTestApp } from "../../test/test-app";
import { validate } from "./validation";

const bodySchema = z.object({ title: z.string().min(1), difficulty: z.number().int().min(1).max(5) });

function appUnderTest() {
  const { logger } = createMemoryLogger();
  return createTestApp(logger).post("/songs", validate("json", bodySchema), (c) =>
    c.json(c.req.valid("json"), 201),
  );
}

function postJson(body: unknown) {
  return appUnderTest().request("/songs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("validate", () => {
  it("passes valid input to the handler", async () => {
    const response = await postJson({ title: "Für Elise", difficulty: 3 });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ title: "Für Elise", difficulty: 3 });
  });

  it("rejects invalid input with one issue per field", async () => {
    const response = await postJson({ title: "", difficulty: 9 });
    const { error } = errorResponseSchema.parse(await response.json());

    expect(response.status).toBe(400);
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.message).toBe("Invalid json");
    expect(error.details).toEqual([
      { path: "title", message: expect.any(String) },
      { path: "difficulty", message: expect.any(String) },
    ]);
  });
});
