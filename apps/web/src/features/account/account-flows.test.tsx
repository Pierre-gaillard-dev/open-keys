import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiError, installFakeApi } from "../../test/fake-api";
import { MEMBER, songDetail, USER } from "../../test/fixtures";
import { renderApp } from "../../test/render-app";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const PASSWORD = "une longue phrase de passe";

describe("invitation link (UC-35)", () => {
  it("creates the account, logs it in and opens the catalogue", async () => {
    let session: typeof MEMBER | null = null;
    const api = installFakeApi({
      "GET /api/auth/me": () => (session ? { json: session } : apiError(401, "UNAUTHORIZED", "No session")),
      "GET /api/invite/abcdefghijklmnopqrstuvwxyz012345": () => ({
        json: { kind: "account", username: null, expiresAt: Date.now() + 1000 },
      }),
      "POST /api/invite/abcdefghijklmnopqrstuvwxyz012345": () => {
        session = MEMBER;
        return { status: 201, json: MEMBER };
      },
      "GET /api/songs": () => ({ json: [] }),
      "GET /api/tags": () => ({ json: [] }),
      "GET /api/library": () => ({ json: [] }),
    });
    renderApp("/invite/abcdefghijklmnopqrstuvwxyz012345");

    expect(await screen.findByRole("heading", { name: "Bienvenue sur Open Keys" })).toBeDefined();
    await userEvent.type(await screen.findByLabelText("Identifiant"), "claire");
    await userEvent.type(screen.getByLabelText("Nouveau mot de passe"), "court");
    await userEvent.type(screen.getByLabelText("Confirmer le mot de passe"), "court");
    await userEvent.click(screen.getByRole("button", { name: "Créer mon compte" }));
    expect(screen.getByText("10 caractères minimum")).toBeDefined();
    expect(api.calls("POST", "/api/invite/abcdefghijklmnopqrstuvwxyz012345")).toHaveLength(0);

    await userEvent.clear(screen.getByLabelText("Nouveau mot de passe"));
    await userEvent.type(screen.getByLabelText("Nouveau mot de passe"), PASSWORD);
    await userEvent.clear(screen.getByLabelText("Confirmer le mot de passe"));
    await userEvent.type(screen.getByLabelText("Confirmer le mot de passe"), PASSWORD);
    await userEvent.click(screen.getByRole("button", { name: "Créer mon compte" }));

    expect(await screen.findByRole("heading", { name: "Catalogue" })).toBeDefined();
    expect(api.calls("POST", "/api/invite/abcdefghijklmnopqrstuvwxyz012345")[0]?.body).toEqual({
      username: "claire",
      password: PASSWORD,
    });
  });

  it("says when the link no longer works", async () => {
    installFakeApi({
      "GET /api/auth/me": () => apiError(401, "UNAUTHORIZED", "No session"),
      "GET /api/invite/*": () => apiError(404, "NOT_FOUND", "Invalid link"),
    });
    renderApp("/invite/abcdefghijklmnopqrstuvwxyz012345");

    expect(await screen.findByText(/Ce lien n'est plus valable/)).toBeDefined();
  });
});

describe("account page", () => {
  it("lets the administrator invite someone, the link being shown once", async () => {
    const api = installFakeApi({
      "GET /api/auth/me": () => ({ json: USER }),
      "GET /api/users": () => ({
        json: [
          { ...USER, createdAt: 1, disabled: false },
          { ...MEMBER, createdAt: 2, disabled: false },
        ],
      }),
      "GET /api/invitations": () => ({ json: [] }),
      "POST /api/invitations": () => ({
        status: 201,
        json: {
          id: "01JD00000000000000000000V1",
          kind: "account",
          username: null,
          createdAt: 1,
          expiresAt: Date.now() + 7 * 86_400_000,
          path: "/invite/secret-token-secret-token",
        },
      }),
    });
    renderApp("/account");

    expect(await screen.findByText("claire")).toBeDefined();
    await userEvent.click(screen.getByRole("button", { name: "Inviter quelqu'un" }));

    const link = (await screen.findByRole("textbox", { name: "Lien d'invitation" })) as HTMLInputElement;
    expect(link.value).toBe(`${window.location.origin}/invite/secret-token-secret-token`);
    expect(api.calls("POST", "/api/invitations")[0]?.body).toEqual({});
  });

  it("shows a member its password form only", async () => {
    installFakeApi({ "GET /api/auth/me": () => ({ json: MEMBER }) });
    renderApp("/account");

    expect(await screen.findByLabelText("Mot de passe actuel")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Inviter quelqu'un" })).toBeNull();
  });
});

describe("rights on the catalogue (D29)", () => {
  it("does not offer to edit or delete a song imported by someone else", async () => {
    const song = songDetail({ canEdit: false });
    installFakeApi({
      "GET /api/auth/me": () => ({ json: MEMBER }),
      [`GET /api/songs/${song.id}`]: () => ({ json: song }),
      [`GET /api/songs/${song.id}/practice-stats`]: () => ({
        json: { songId: song.id, totalActiveMs: 0, sessionCount: 0, lastPracticedAt: null },
      }),
      [`GET /api/songs/${song.id}/loops`]: () => ({ json: [] }),
      "GET /api/library": () => ({ json: [] }),
    });
    renderApp(`/songs/${song.id}`);

    expect(await screen.findByRole("heading", { name: song.title, level: 1 })).toBeDefined();
    await waitFor(() => expect(screen.getByRole("link", { name: /Jouer/ })).toBeDefined());
    expect(screen.queryByRole("link", { name: "Modifier le morceau" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Supprimer/ })).toBeNull();
  });
});
