import { describe, expect, it } from "vitest";
import { errorResponseSchema } from "./error.contract";

describe("errorResponseSchema", () => {
  it("accepts an error with details", () => {
    const body = {
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid input",
        requestId: "r1",
        details: [{ path: "a" }],
      },
    };
    expect(errorResponseSchema.parse(body)).toEqual(body);
  });

  it("rejects an unknown error code", () => {
    const body = { error: { code: "TEAPOT", message: "?", requestId: "r1" } };
    expect(errorResponseSchema.safeParse(body).success).toBe(false);
  });
});
