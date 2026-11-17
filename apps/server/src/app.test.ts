import { errorResponseSchema, healthResponseSchema } from "@open-keys/contracts";
import { afterEach, describe, expect, it } from "vitest";
import { createTestServer, type TestServer } from "./test/test-server";

let server: TestServer;

afterEach(() => server?.close());

describe("GET /api/health", () => {
  it("is public and returns the version", async () => {
    server = await createTestServer({ env: { APP_VERSION: "1.2.3" } });

    const response = await server.request("/api/health");

    expect(response.status).toBe(200);
    expect(healthResponseSchema.parse(await response.json())).toEqual({ status: "ok", version: "1.2.3" });
  });

  it("sends security headers and a request id", async () => {
    server = await createTestServer();

    const response = await server.request("/api/health");

    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("X-Request-Id")).toBeTruthy();
  });
});

describe("authentication boundary", () => {
  const SONG = "01ARYZ6S41TSV4RRFFQ69G5FAV";
  const protectedRoutes: [string, string][] = [
    ["GET", "/api/songs"],
    ["GET", `/api/songs/${SONG}`],
    ["PATCH", `/api/songs/${SONG}`],
    ["DELETE", `/api/songs/${SONG}`],
    ["GET", `/api/songs/${SONG}/midi`],
    ["GET", `/api/songs/${SONG}/cover`],
    ["PUT", `/api/songs/${SONG}/cover`],
    ["GET", `/api/songs/${SONG}/cover-suggestions?title=x`],
    ["GET", `/api/songs/${SONG}/loops`],
    ["GET", `/api/songs/${SONG}/practice-stats`],
    ["POST", "/api/imports/url"],
    ["POST", `/api/imports/${SONG}/confirm`],
    ["GET", "/api/tags"],
    ["GET", "/api/library"],
    ["PUT", `/api/library/${SONG}`],
    ["PUT", `/api/loops/${SONG}`],
    ["DELETE", `/api/loops/${SONG}`],
    ["PUT", `/api/practice-sessions/${SONG}`],
    ["GET", "/api/auth/me"],
  ];

  it.each(protectedRoutes)("%s %s requires a session", async (method, path) => {
    server = await createTestServer();

    const response = await server.json(
      method,
      path,
      method === "GET" || method === "DELETE" ? undefined : {},
    );

    expect(response.status).toBe(401);
    expect(errorResponseSchema.parse(await response.json()).error.code).toBe("UNAUTHORIZED");
  });

  it("rejects a forged session cookie", async () => {
    server = await createTestServer();

    const response = await server.request("/api/songs", { headers: { Cookie: "open_keys_session=forged" } });

    expect(response.status).toBe(401);
  });
});

describe("cross-site requests", () => {
  it("blocks a form upload coming from another origin", async () => {
    server = await createTestServer();
    await server.login();
    const form = new FormData();
    form.append("file", new File(["MThd"], "a.mid"));

    const response = await server.request("/api/imports/file", {
      method: "POST",
      body: form,
      headers: { Origin: "https://evil.example" },
    });

    expect(response.status).toBe(403);
  });
});

describe("unknown routes", () => {
  it("answer NOT_FOUND to an authenticated user", async () => {
    server = await createTestServer();
    await server.login();

    const response = await server.request("/api/nope");

    expect(response.status).toBe(404);
    expect(errorResponseSchema.parse(await response.json()).error.code).toBe("NOT_FOUND");
  });
});
