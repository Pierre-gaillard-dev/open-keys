import { ERROR_CODES } from "@open-keys/contracts";
import { describe, expect, it } from "vitest";
import { AppError, errorCodeOfStatus, httpStatusOf } from "./errors";

describe("httpStatusOf", () => {
  it.each([
    ["VALIDATION_ERROR", 400],
    ["UNAUTHORIZED", 401],
    ["NOT_FOUND", 404],
    ["CONFLICT", 409],
    ["RATE_LIMITED", 429],
    ["INTERNAL_ERROR", 500],
  ] as const)("maps %s to %i", (code, status) => {
    expect(httpStatusOf(code)).toBe(status);
  });

  it("maps every error code", () => {
    for (const code of ERROR_CODES) {
      expect(httpStatusOf(code)).toBeGreaterThanOrEqual(400);
    }
  });
});

describe("errorCodeOfStatus", () => {
  it.each([
    [400, "BAD_REQUEST"],
    [404, "NOT_FOUND"],
    [413, "PAYLOAD_TOO_LARGE"],
    [418, "BAD_REQUEST"],
    [503, "INTERNAL_ERROR"],
  ] as const)("maps %i to %s", (status, code) => {
    expect(errorCodeOfStatus(status)).toBe(code);
  });
});

describe("AppError", () => {
  it("carries its code, status, details and cause", () => {
    const cause = new Error("db");
    const error = new AppError("CONFLICT", "Already exists", { details: { id: "1" }, cause });

    expect(error).toBeInstanceOf(Error);
    expect(error.status).toBe(409);
    expect(error.details).toEqual({ id: "1" });
    expect(error.cause).toBe(cause);
  });
});
