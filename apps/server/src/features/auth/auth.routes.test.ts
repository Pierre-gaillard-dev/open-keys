import { authUserSchema, errorResponseSchema } from "@open-keys/contracts";
import { afterEach, describe, expect, it } from "vitest";
import { createTestServer, TEST_PASSWORD, type TestServer } from "../../test/test-server";
import { SESSION_TTL_MS } from "./auth.service";

const DAY_MS = 24 * 60 * 60_000;
let server: TestServer;

afterEach(() => server?.close());

async function errorCode(response: Response) {
  return errorResponseSchema.parse(await response.json()).error.code;
}

describe("POST /api/auth/login", () => {
  it("opens a session in an httpOnly cookie", async () => {
    server = await createTestServer();

    const response = await server.login();

    expect(response.status).toBe(200);
    expect(authUserSchema.parse(await response.json()).username).toBe("pierre");
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/^open_keys_session=[\w-]{43};/);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect((await server.request("/api/auth/me")).status).toBe(200);
  });

  it("marks the cookie Secure when configured", async () => {
    server = await createTestServer({ env: { COOKIE_SECURE: "true" } });

    expect((await server.login()).headers.get("set-cookie")).toContain("Secure");
  });

  it("rejects a wrong password and an unknown user with the same error", async () => {
    server = await createTestServer();
    await server.services.auth.ensureInitialUser("pierre", TEST_PASSWORD);

    const wrongPassword = await server.json("POST", "/api/auth/login", {
      username: "pierre",
      password: "nope",
    });
    const unknownUser = await server.json("POST", "/api/auth/login", { username: "ghost", password: "nope" });

    expect(wrongPassword.status).toBe(401);
    expect(unknownUser.status).toBe(401);
    expect(await wrongPassword.json()).toMatchObject({ error: { message: "Invalid username or password" } });
    expect(await unknownUser.json()).toMatchObject({ error: { message: "Invalid username or password" } });
  });

  it("rate limits repeated failures with Retry-After", async () => {
    server = await createTestServer({ loginPolicy: { maxFailures: 3, windowMs: 60_000 } });
    await server.services.auth.ensureInitialUser("pierre", TEST_PASSWORD);
    const attempt = (password: string) =>
      server.json("POST", "/api/auth/login", { username: "pierre", password });

    for (let i = 0; i < 3; i++) {
      expect((await attempt("wrong")).status).toBe(401);
    }
    const blocked = await attempt(TEST_PASSWORD);

    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBe("60");
    expect(await errorCode(blocked)).toBe("RATE_LIMITED");
    server.advance(60_001);
    expect((await attempt(TEST_PASSWORD)).status).toBe(200);
  });

  it("validates the request body", async () => {
    server = await createTestServer();

    const response = await server.json("POST", "/api/auth/login", { username: "" });

    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe("VALIDATION_ERROR");
  });
});

describe("sessions", () => {
  it("logout invalidates the session", async () => {
    server = await createTestServer();
    await server.login();

    const logout = await server.request("/api/auth/logout", { method: "POST" });

    expect(logout.status).toBe(204);
    expect(logout.headers.get("set-cookie")).toContain("open_keys_session=;");
    expect((await server.request("/api/auth/me")).status).toBe(401);
  });

  it("expire after 90 days without use", async () => {
    server = await createTestServer();
    await server.login();

    server.advance(SESSION_TTL_MS + 1);

    expect((await server.request("/api/auth/me")).status).toBe(401);
  });

  it("slide: using the session pushes back its expiry and re-issues the cookie", async () => {
    server = await createTestServer();
    await server.login();

    server.advance(80 * DAY_MS);
    const used = await server.request("/api/auth/me");
    server.advance(80 * DAY_MS);

    expect(used.status).toBe(200);
    expect(used.headers.get("set-cookie")).toContain("open_keys_session=");
    expect((await server.request("/api/auth/me")).status).toBe(200);
  });

  it("are purged once expired", async () => {
    server = await createTestServer();
    await server.login();
    server.advance(SESSION_TTL_MS + 1);

    expect(server.services.auth.purgeExpiredSessions()).toBe(1);
  });
});

describe("initial user", () => {
  it("is created only when no user exists", async () => {
    server = await createTestServer();

    expect(await server.services.auth.ensureInitialUser("pierre", TEST_PASSWORD)).toBe(true);
    expect(await server.services.auth.ensureInitialUser("other", TEST_PASSWORD)).toBe(false);
  });
});
