import {
  authUserSchema,
  createdInvitationSchema,
  invitationSchema,
  inviteInfoSchema,
  songDetailSchema,
  userAccountSchema,
} from "@open-keys/contracts";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { twoHandMidi } from "../../test/fixtures";
import { createTestServer, TEST_PASSWORD, type TestServer } from "../../test/test-server";
import { INVITATION_TTL_MS } from "./accounts.service";

let server: TestServer;

afterEach(() => server?.close());

const NEW_PASSWORD = "une longue phrase de passe";

async function adminServer() {
  server = await createTestServer();
  await server.login();
  return server;
}

async function invite(userId?: string): Promise<string> {
  const response = await server.json("POST", "/api/invitations", userId ? { userId } : {});
  expect(response.status).toBe(201);
  return createdInvitationSchema.parse(await response.json()).path.replace("/invite/", "");
}

describe("invitations (UC-34, UC-35)", () => {
  it("creates an account from a single-use link and logs it in, as a member", async () => {
    await adminServer();
    const token = await invite();
    server.forgetSession();

    const info = inviteInfoSchema.parse(await (await server.request(`/api/invite/${token}`)).json());
    expect(info).toMatchObject({ kind: "account", username: null });

    const accepted = await server.json("POST", `/api/invite/${token}`, {
      username: "claire",
      password: NEW_PASSWORD,
    });
    expect(accepted.status).toBe(201);
    expect(authUserSchema.parse(await accepted.json())).toMatchObject({ username: "claire", role: "member" });
    expect(accepted.headers.get("set-cookie")).toContain("open_keys_session=");

    // Used up: a second try fails, and the new account can log in.
    const again = await server.json("POST", `/api/invite/${token}`, {
      username: "eve",
      password: NEW_PASSWORD,
    });
    expect(again.status).toBe(404);
    expect((await server.login("claire", NEW_PASSWORD)).status).toBe(200);
  });

  it("refuses a taken username (any case), a short password and an expired link", async () => {
    await adminServer();
    const token = await invite();

    const taken = await server.json("POST", `/api/invite/${token}`, {
      username: "PIERRE",
      password: NEW_PASSWORD,
    });
    expect(taken.status).toBe(409);
    const short = await server.json("POST", `/api/invite/${token}`, {
      username: "claire",
      password: "court",
    });
    expect(short.status).toBe(400);

    server.advance(INVITATION_TTL_MS + 1);
    expect((await server.request(`/api/invite/${token}`)).status).toBe(404);
  });

  it("resets a forgotten password and closes the other sessions", async () => {
    await adminServer();
    await server.addUser("claire");
    const users = z.array(userAccountSchema).parse(await (await server.request("/api/users")).json());
    const claire = users.find((user) => user.username === "claire");
    const token = await invite(claire?.id);

    const info = inviteInfoSchema.parse(await (await server.request(`/api/invite/${token}`)).json());
    expect(info).toMatchObject({ kind: "reset", username: "claire" });
    expect((await server.json("POST", `/api/invite/${token}`, { password: NEW_PASSWORD })).status).toBe(201);

    expect((await server.login("claire", TEST_PASSWORD)).status).toBe(401);
    expect((await server.login("claire", NEW_PASSWORD)).status).toBe(200);
  });

  it("lists and revokes the pending links", async () => {
    await adminServer();
    const token = await invite();
    const pending = z.array(invitationSchema).parse(await (await server.request("/api/invitations")).json());
    expect(pending).toHaveLength(1);

    expect((await server.request(`/api/invitations/${pending[0]?.id}`, { method: "DELETE" })).status).toBe(
      204,
    );
    expect((await server.request(`/api/invite/${token}`)).status).toBe(404);
  });
});

describe("administration (UC-37)", () => {
  it("is reserved to the administrator", async () => {
    await adminServer();
    await server.addUser("claire");
    await server.login("claire");

    expect((await server.request("/api/users")).status).toBe(403);
    expect((await server.json("POST", "/api/invitations", {})).status).toBe(403);
    // The rest of the API stays open to members.
    expect((await server.request("/api/songs")).status).toBe(200);
  });

  it("disables an account: logged out everywhere, cannot log in again", async () => {
    await adminServer();
    await server.addUser("claire");
    const users = z.array(userAccountSchema).parse(await (await server.request("/api/users")).json());
    const [admin, claire] = users;

    expect((await server.json("PATCH", `/api/users/${admin?.id}`, { disabled: true })).status).toBe(409);
    const disabled = await server.json("PATCH", `/api/users/${claire?.id}`, { disabled: true });
    expect(userAccountSchema.parse(await disabled.json()).disabled).toBe(true);

    expect((await server.login("claire")).status).toBe(401);
  });
});

describe("password change (UC-36)", () => {
  it("checks the current password, then keeps only the current session", async () => {
    await adminServer();

    const wrong = await server.json("PUT", "/api/auth/password", {
      currentPassword: "nope",
      newPassword: NEW_PASSWORD,
    });
    expect(wrong.status).toBe(400);
    const changed = await server.json("PUT", "/api/auth/password", {
      currentPassword: TEST_PASSWORD,
      newPassword: NEW_PASSWORD,
    });
    expect(changed.status).toBe(204);

    expect((await server.request("/api/auth/me")).status).toBe(200);
    expect((await server.login("pierre", TEST_PASSWORD)).status).toBe(401);
    expect((await server.login("pierre", NEW_PASSWORD)).status).toBe(200);
  });
});

describe("rights on the catalogue (D29)", () => {
  it("lets everyone play a song, only its importer or the administrator change it", async () => {
    await adminServer();
    await server.addUser("claire");
    await server.addUser("bob");
    await server.login("claire");
    const draft = songDetailSchema.parse(
      await (await server.upload("/api/imports/file", twoHandMidi("", 0), "a.mid")).json(),
    );
    expect(draft.canEdit).toBe(true);

    await server.login("bob");
    expect(
      songDetailSchema.parse(await (await server.request(`/api/songs/${draft.id}`)).json()).canEdit,
    ).toBe(false);
    expect((await server.json("PATCH", `/api/songs/${draft.id}`, { title: "Pirate" })).status).toBe(403);
    expect((await server.request(`/api/songs/${draft.id}`, { method: "DELETE" })).status).toBe(403);
    expect((await server.request(`/api/songs/${draft.id}/cover`, { method: "DELETE" })).status).toBe(403);

    await server.login("pierre");
    expect((await server.json("PATCH", `/api/songs/${draft.id}`, { title: "Revu" })).status).toBe(200);
  });
});
