import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiError, installFakeApi } from "../test/fake-api";
import { songDetail, songSummary, USER } from "../test/fixtures";
import { renderApp } from "../test/render-app";

afterEach(() => {
  vi.unstubAllGlobals();
});

const unauthenticated = () => apiError(401, "UNAUTHORIZED", "Authentication required");

describe("authentication", () => {
  it("sends visitors to the login page, then back where they wanted to go", async () => {
    let loggedIn = false;
    const api = installFakeApi({
      "GET /api/auth/me": () => (loggedIn ? { json: USER } : unauthenticated()),
      "POST /api/auth/login": () => {
        loggedIn = true;
        return { json: USER };
      },
      "GET /api/songs": () => ({ json: [songSummary({ title: "Für Elise" })] }),
      "GET /api/tags": () => ({ json: [] }),
    });
    const { router } = renderApp("/?view=learning");

    await screen.findByRole("heading", { name: "Open Keys" });
    await userEvent.type(screen.getByLabelText("Identifiant"), "pierre");
    await userEvent.type(screen.getByLabelText("Mot de passe"), "secret password");
    await userEvent.click(screen.getByRole("button", { name: "Se connecter" }));

    expect(await screen.findByRole("heading", { name: "Catalogue" })).toBeDefined();
    expect(api.calls("POST", "/api/auth/login")[0]?.body).toEqual({
      username: "pierre",
      password: "secret password",
    });
    expect(router.state.location.search).toEqual({ view: "learning" });
  });

  it("shows the server message on wrong credentials", async () => {
    installFakeApi({
      "GET /api/auth/me": unauthenticated,
      "POST /api/auth/login": () => apiError(401, "UNAUTHORIZED", "Invalid username or password"),
    });
    renderApp("/login");

    await userEvent.type(await screen.findByLabelText("Identifiant"), "pierre");
    await userEvent.type(screen.getByLabelText("Mot de passe"), "nope");
    await userEvent.click(screen.getByRole("button", { name: "Se connecter" }));

    expect(await screen.findByText("Invalid username or password")).toBeDefined();
  });

  it("returns to the login page when the session expires during use", async () => {
    let expired = false;
    installFakeApi({
      "GET /api/auth/me": () => (expired ? unauthenticated() : { json: USER }),
      "GET /api/songs": () => (expired ? unauthenticated() : { json: [] }),
      "GET /api/tags": () => ({ json: [] }),
    });
    renderApp("/");
    await screen.findByRole("heading", { name: "Catalogue" });

    expired = true;
    await userEvent.click(screen.getByRole("button", { name: "Favoris" }));

    expect(await screen.findByRole("button", { name: "Se connecter" })).toBeDefined();
  });
});

describe("catalogue", () => {
  it("lists songs and sends filters to the API", async () => {
    const api = installFakeApi({
      "GET /api/auth/me": () => ({ json: USER }),
      "GET /api/songs": () => ({
        json: [
          songSummary({
            title: "Gymnopédie n°1",
            library: { status: "learning", isFavorite: true, lastPracticedAt: null },
          }),
          songSummary({ title: "Clair de lune", composer: "Claude Debussy", difficulty: 5 }),
        ],
      }),
      "GET /api/tags": () => ({ json: [{ name: "lent", songCount: 1 }] }),
    });
    renderApp("/");

    const list = await screen.findByRole("list");
    expect(
      within(list)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual([expect.stringContaining("Gymnopédie n°1"), expect.stringContaining("Clair de lune")]);
    expect(screen.getByText("2 morceaux")).toBeDefined();

    await userEvent.click(screen.getByRole("button", { name: "Favoris" }));
    await userEvent.click(await screen.findByRole("button", { name: "#lent" }));

    await waitFor(() => {
      const last = api.calls("GET", "/api/songs").at(-1);
      expect(last?.query.get("favorite")).toBe("true");
      expect(last?.query.get("tags")).toBe("lent");
    });
  });

  it("invites to import when the catalogue is empty", async () => {
    installFakeApi({
      "GET /api/auth/me": () => ({ json: USER }),
      "GET /api/songs": () => ({ json: [] }),
      "GET /api/tags": () => ({ json: [] }),
    });
    renderApp("/");

    expect(await screen.findByText("Ton catalogue est vide. Importe un premier morceau MIDI.")).toBeDefined();
  });
});

describe("import", () => {
  it("imports a file, reviews it and adds it to the catalogue", async () => {
    const draft = songDetail({ state: "draft", title: "gymnopedie 1", composer: null, tags: [] });
    const [upper, lower] = draft.tracks;
    let stored = draft;
    const api = installFakeApi({
      "GET /api/auth/me": () => ({ json: USER }),
      "POST /api/imports/file": () => ({ status: 201, json: draft }),
      [`GET /api/songs/${draft.id}`]: () => ({ json: stored }),
      [`POST /api/imports/${draft.id}/confirm`]: (request) => {
        stored = { ...draft, ...(request.body as object), state: "ready", tracks: draft.tracks };
        return { json: stored };
      },
      [`GET /api/songs/${draft.id}/practice-stats`]: () => ({
        json: { songId: draft.id, totalActiveMs: 0, sessionCount: 0, lastPracticedAt: null },
      }),
      [`GET /api/songs/${draft.id}/loops`]: () => ({ json: [] }),
      "GET /api/library": () => ({ json: [] }),
    });
    renderApp("/import");

    const input = await screen.findByLabelText("Fichier MIDI à importer");
    await userEvent.upload(input, new File(["MThd"], "gymnopedie_1.mid", { type: "audio/midi" }));

    const title = await screen.findByLabelText("Titre");
    await userEvent.clear(title);
    await userEvent.type(title, "Gymnopédie n°1");
    await userEvent.type(screen.getByLabelText("Compositeur"), "Erik Satie");
    await userEvent.type(screen.getByLabelText("Tags"), "Lent{Enter}");
    const lowerTrack = screen.getByRole("radiogroup", { name: "Main de la piste lower" });
    await userEvent.click(within(lowerTrack).getByRole("radio", { name: "Ignorer" }));
    await userEvent.click(screen.getByRole("button", { name: "Ajouter au catalogue" }));

    expect(await screen.findByRole("heading", { name: "Gymnopédie n°1", level: 1 })).toBeDefined();
    expect(api.calls("POST", `/api/imports/${draft.id}/confirm`)[0]?.body).toEqual({
      title: "Gymnopédie n°1",
      composer: "Erik Satie",
      difficulty: 2,
      license: null,
      tags: ["lent"],
      handMode: "tracks",
      splitPitch: 60,
      tracks: [
        { id: upper?.id, hand: "right" },
        { id: lower?.id, hand: "ignore" },
      ],
    });
  });

  it("sets a cover from a URL with Enter, without submitting the import", async () => {
    const draft = songDetail({ state: "draft" });
    const api = installFakeApi({
      "GET /api/auth/me": () => ({ json: USER }),
      [`GET /api/songs/${draft.id}`]: () => ({ json: draft }),
      [`PUT /api/songs/${draft.id}/cover`]: () => undefined,
      "GET /api/tags": () => ({ json: [] }),
    });
    renderApp(`/import/${draft.id}`);

    await userEvent.type(
      await screen.findByLabelText("Ou une URL d'image"),
      "https://example.org/cover.jpg{Enter}",
    );

    await waitFor(() => expect(api.calls("PUT", `/api/songs/${draft.id}/cover`)).toHaveLength(1));
    expect(api.calls("PUT", `/api/songs/${draft.id}/cover`)[0]?.body).toEqual({
      url: "https://example.org/cover.jpg",
    });
    expect(api.calls("POST", `/api/imports/${draft.id}/confirm`)).toHaveLength(0);
  });

  it("validates the title before sending anything", async () => {
    const draft = songDetail({ state: "draft" });
    const api = installFakeApi({
      "GET /api/auth/me": () => ({ json: USER }),
      [`GET /api/songs/${draft.id}`]: () => ({ json: draft }),
    });
    renderApp(`/import/${draft.id}`);

    await userEvent.clear(await screen.findByLabelText("Titre"));
    await userEvent.click(screen.getByRole("button", { name: "Ajouter au catalogue" }));

    expect(screen.getByLabelText("Titre").getAttribute("aria-invalid")).toBe("true");
    expect(api.calls("POST", `/api/imports/${draft.id}/confirm`)).toHaveLength(0);
  });

  it("offers to open the existing song when the file is a duplicate", async () => {
    installFakeApi({
      "GET /api/auth/me": () => ({ json: USER }),
      "POST /api/imports/url": () =>
        apiError(409, "CONFLICT", "This MIDI file is already in the catalogue", {
          songId: "01JD0000000000000000000042",
          title: "Für Elise",
        }),
    });
    renderApp("/import");

    await userEvent.type(await screen.findByLabelText("Depuis une URL"), "https://example.org/elise.mid");
    await userEvent.click(screen.getByRole("button", { name: "Analyser le fichier" }));

    const link = await screen.findByRole("link", { name: "Ouvrir le morceau existant" });
    expect(link.getAttribute("href")).toBe("/songs/01JD0000000000000000000042");
    expect(screen.getByText("« Für Elise » a la même empreinte.")).toBeDefined();
  });
});
