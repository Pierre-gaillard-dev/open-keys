import { describe, expect, it } from "vitest";
import { loadEnv } from "./env";

describe("loadEnv", () => {
  it("applies development defaults", () => {
    expect(loadEnv({})).toMatchObject({
      NODE_ENV: "development",
      PORT: 3000,
      APP_VERSION: "dev",
      LOG_LEVEL: "info",
      DATA_DIR: "./data",
      COOKIE_SECURE: false,
      TRUST_PROXY: false,
      MAX_MIDI_SIZE: 2 * 1024 * 1024,
      SOURCES_SYNC: true,
      allowedOrigins: ["http://localhost:5173"],
    });
  });

  it("coerces numbers and booleans", () => {
    const env = loadEnv({ PORT: "8080", TRUST_PROXY: "true", COOKIE_SECURE: "true" });

    expect(env.PORT).toBe(8080);
    expect(env.TRUST_PROXY).toBe(true);
    expect(env.COOKIE_SECURE).toBe(true);
  });

  it("derives the allowed origin and secure cookies from the public URL in production", () => {
    const env = loadEnv({ NODE_ENV: "production", PUBLIC_URL: "https://keys.example.org/app" });

    expect(env.allowedOrigins).toEqual(["https://keys.example.org"]);
    expect(env.COOKIE_SECURE).toBe(true);
  });

  it("treats empty values as unset, as docker compose passes them", () => {
    const env = loadEnv({ ADMIN_USERNAME: "", ADMIN_PASSWORD: "", LOG_LEVEL: "" });

    expect(env.ADMIN_USERNAME).toBeUndefined();
    expect(env.LOG_LEVEL).toBe("info");
    expect(() => loadEnv({ NODE_ENV: "production", PUBLIC_URL: "" })).toThrow();
  });

  it.each([
    [{ PORT: "not-a-port" }],
    [{ LOG_LEVEL: "verbose" }],
    [{ ADMIN_USERNAME: "pierre" }],
    [{ ADMIN_USERNAME: "pierre", ADMIN_PASSWORD: "short" }],
    [{ NODE_ENV: "production" }],
    [{ PUBLIC_URL: "ftp://example.org" }],
  ])("rejects %j", (source) => {
    expect(() => loadEnv(source)).toThrow();
  });
});
