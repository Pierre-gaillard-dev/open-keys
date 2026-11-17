import type { MutopiaPiece } from "@open-keys/contracts";
import { buildMidi, scale } from "@open-keys/core/testing";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installFakeApi } from "../../test/fake-api";
import { songDetail, USER } from "../../test/fixtures";
import { renderApp } from "../../test/render-app";

/** No Web Audio in jsdom: the preview plays on a fake piano. */
const played = vi.hoisted(() => ({ notes: 0 }));
vi.mock("../player/runtime/audio-runtime", () => ({
  createAudioRuntime: () => ({
    audio: { currentTime: 0, baseLatency: 0, outputLatency: 0, resume: () => Promise.resolve() },
    output: {
      play: () => {
        played.notes++;
      },
      stopAll: () => undefined,
    },
    loadSamples: () => Promise.resolve(),
    close: () => undefined,
  }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  played.notes = 0;
});

function piece(overrides: Partial<MutopiaPiece>): MutopiaPiece {
  return {
    id: 37,
    title: "Gymnopédie No. 1",
    composer: "E. Satie",
    opus: null,
    instrument: "Piano",
    keyboardSolo: true,
    style: "Classical",
    license: "Public Domain",
    publishedAt: Date.UTC(2014, 11, 14),
    songId: null,
    ...overrides,
  };
}

function mutopiaApi() {
  const existing = songDetail({ title: "Gymnopédie No. 1" });
  const draft = songDetail({ state: "draft", title: "Gymnopédie No. 2", composer: "E. Satie" });
  const api = installFakeApi({
    "GET /api/auth/me": () => ({ json: USER }),
    "GET /api/mutopia/pieces": (request) => {
      const q = request.query.get("q") ?? "";
      const pieces = [
        piece({ id: 37, songId: existing.id }),
        piece({ id: 38, title: "Gymnopédie No. 2" }),
        piece({ id: 40, title: "Vocalise", instrument: "Voice and Piano", keyboardSolo: false }),
      ].filter(
        (p) => p.title.toLowerCase().includes(q) && (request.query.get("solo") === "false" || p.keyboardSolo),
      );
      return { json: { pieces, total: pieces.length, syncedAt: Date.UTC(2026, 10, 14) } };
    },
    "POST /api/mutopia/pieces/38/import": () => ({ status: 201, json: draft }),
    "GET /api/mutopia/pieces/38/midi": () => ({ bytes: buildMidi([{ notes: scale(60, 8) }]) }),
    [`GET /api/songs/${draft.id}`]: () => ({ json: draft }),
    "GET /api/tags": () => ({ json: [] }),
  });
  return { api, existing, draft };
}

describe("Mutopia search (UC-20)", () => {
  it("is one of the two ways to import", async () => {
    mutopiaApi();
    renderApp("/import");

    const tabs = await screen.findByRole("navigation", { name: "Mode d'import" });
    await userEvent.click(within(tabs).getByRole("link", { name: "Rechercher en ligne" }));

    expect(await screen.findByRole("heading", { name: "Rechercher en ligne", level: 1 })).toBeDefined();
    expect(await screen.findByText("Index Mutopia mis à jour le 14/11/2026")).toBeDefined();
  });

  it("searches keyboard pieces, or every piece with a piano", async () => {
    const { api } = mutopiaApi();
    renderApp("/import/search");

    await userEvent.type(await screen.findByLabelText("Rechercher dans Mutopia"), "o");
    const results = await screen.findByRole("region", { name: "Résultats Mutopia" });
    await waitFor(() => expect(api.requests.at(-1)?.query.get("q")).toBe("o"));
    expect(within(results).queryByRole("button", { name: "Importer Vocalise" })).toBeNull();

    await userEvent.selectOptions(screen.getByLabelText("Instrumentation"), "all");

    expect(await within(results).findByRole("button", { name: "Importer Vocalise" })).toBeDefined();
    expect(api.requests.at(-1)?.query.get("solo")).toBe("false");
  });

  it("links a piece already imported, imports another one into the review screen", async () => {
    const { api, existing } = mutopiaApi();
    renderApp("/import/search");

    const results = await screen.findByRole("region", { name: "Résultats Mutopia" });
    expect(within(results).getByRole("link", { name: "Dans le catalogue" }).getAttribute("href")).toBe(
      `/songs/${existing.id}`,
    );
    await userEvent.click(within(results).getByRole("button", { name: "Importer Gymnopédie No. 2" }));

    expect(await screen.findByRole("heading", { name: "Vérifier l'import" })).toBeDefined();
    expect(((await screen.findByLabelText("Compositeur")) as HTMLInputElement).value).toBe("E. Satie");
    expect(api.calls("POST", "/api/mutopia/pieces/38/import")).toHaveLength(1);
  });

  it("plays a piece before importing it, and stops it", async () => {
    mutopiaApi();
    renderApp("/import/search");

    const listen = await screen.findByRole("button", { name: "Écouter Gymnopédie No. 2" });
    await userEvent.click(listen);

    const stop = await screen.findByRole("button", { name: "Arrêter Gymnopédie No. 2" });
    await waitFor(() => expect(stop.getAttribute("aria-pressed")).toBe("true"));
    // The first notes are scheduled on the (fake) piano.
    await waitFor(() => expect(played.notes).toBeGreaterThan(0));
    await userEvent.click(stop);
    expect(await screen.findByRole("button", { name: "Écouter Gymnopédie No. 2" })).toBeDefined();
  });
});
