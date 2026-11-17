import { describe, expect, it } from "vitest";
import { loadEnv } from "./env";

describe("loadEnv", () => {
  it("applies defaults", () => {
    expect(loadEnv({})).toEqual({
      NODE_ENV: "development",
      PORT: 3000,
      APP_VERSION: "dev",
      LOG_LEVEL: "info",
    });
  });

  it("coerces the port", () => {
    expect(loadEnv({ PORT: "8080" }).PORT).toBe(8080);
  });

  it("rejects an invalid port", () => {
    expect(() => loadEnv({ PORT: "not-a-port" })).toThrow();
  });

  it("rejects an unknown log level", () => {
    expect(() => loadEnv({ LOG_LEVEL: "verbose" })).toThrow();
  });
});
