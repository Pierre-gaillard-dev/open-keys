import type { SourcePiece } from "@open-keys/contracts";
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

function piece(overrides: Partial<SourcePiece> & Pick<SourcePiece, "id" | "title">): SourcePiece {
  return {
    source: "mutopia",
    composer: "E. Satie",
    opus: null,
    instrument: "Piano",
    solo: true,
    style: null,
    license: "Public Domain",
    credit: null,
    durationMs: null,
    publishedAt: null,
    songId: null,
    ...overrides,
  };
}

function sourcesApi() {
  const existing = songDetail({ title: "Gymnopédie No. 1" });
  const draft = songDetail({ state: "draft", title: "Gymnopédie No. 2", composer: "E. Satie" });
  const all = [
    piece({ id: "mutopia:37", title: "Gymnopédie No. 1", songId: existing.id }),
    piece({ id: "mutopia:38", title: "Gymnopédie No. 2" }),
    piece({ id: "mutopia:40", title: "Vocalise", instrument: "Voice and Piano", solo: false }),
    piece({
      id: "xivmidi:abc",
      source: "xivmidi",
      title: "Bad Apple",
      composer: "Alstroemeria Records",
      credit: "Bard Arranger",
      license: null,
      durationMs: 219_000,
    }),
  ];
  const api = installFakeApi({
    "GET /api/auth/me": () => ({ json: USER }),
    "GET /api/sources/pieces": (request) => {
      const q = request.query.get("q") ?? "";
      const source = request.query.get("source");
      const pieces = all.filter(
        (p) =>
          p.title.toLowerCase().includes(q) &&
          (!source || p.source === source) &&
          (request.query.get("solo") === "false" || p.solo),
      );
      return {
        json: {
          pieces,
          total: pieces.length,
          sources: [
            { source: "mutopia", pieceCount: 744, syncedAt: Date.UTC(2026, 10, 14) },
            { source: "maestro", pieceCount: 0, syncedAt: null },
            { source: "xivmidi", pieceCount: 6890, syncedAt: Date.UTC(2026, 10, 15) },
          ],
        },
      };
    },
    "POST /api/sources/pieces/mutopia%3A38/import": () => ({ status: 201, json: draft }),
    "GET /api/sources/pieces/mutopia%3A38/midi": () => ({ bytes: buildMidi([{ notes: scale(60, 8) }]) }),
    [`GET /api/songs/${draft.id}`]: () => ({ json: draft }),
    "GET /api/tags": () => ({ json: [] }),
  });
  return { api, existing, draft };
}

describe("online search (UC-20)", () => {
  it("is one of the two ways to import, and shows the state of each library", async () => {
    sourcesApi();
    renderApp("/import");

    const tabs = await screen.findByRole("navigation", { name: "Mode d'import" });
    await userEvent.click(within(tabs).getByRole("link", { name: "Rechercher en ligne" }));

    expect(await screen.findByRole("heading", { name: "Rechercher en ligne", level: 1 })).toBeDefined();
    expect(
      await screen.findByText(
        "Mutopia Project 744 · MAESTRO (index en cours de création) · xivmidi 6 890 · à jour au 14/11/2026",
      ),
    ).toBeDefined();
  });

  it("searches every library or one, solo pieces or everything, with the credit of each file", async () => {
    const { api } = sourcesApi();
    renderApp("/import/search");

    const results = await screen.findByRole("region", { name: "Résultats en ligne" });
    expect(within(results).getByText("Bard Arranger")).toBeDefined();
    expect(within(results).queryByRole("button", { name: "Importer Vocalise" })).toBeNull();

    await userEvent.selectOptions(screen.getByLabelText("Formation"), "all");
    expect(await within(results).findByRole("button", { name: "Importer Vocalise" })).toBeDefined();

    await userEvent.selectOptions(screen.getByLabelText("Source"), "xivmidi");
    await waitFor(() =>
      expect(within(results).queryByRole("button", { name: "Importer Vocalise" })).toBeNull(),
    );
    expect(api.requests.at(-1)?.query.get("source")).toBe("xivmidi");
    expect(api.requests.at(-1)?.query.get("solo")).toBe("false");

    await userEvent.type(screen.getByLabelText("Rechercher dans les bibliothèques en ligne"), "bad");
    await waitFor(() => expect(api.requests.at(-1)?.query.get("q")).toBe("bad"));
  });

  it("links a piece already imported, imports another one into the review screen", async () => {
    const { api, existing } = sourcesApi();
    renderApp("/import/search");

    const results = await screen.findByRole("region", { name: "Résultats en ligne" });
    expect(within(results).getByRole("link", { name: "Dans le catalogue" }).getAttribute("href")).toBe(
      `/songs/${existing.id}`,
    );
    await userEvent.click(within(results).getByRole("button", { name: "Importer Gymnopédie No. 2" }));

    expect(await screen.findByRole("heading", { name: "Vérifier l'import" })).toBeDefined();
    expect(((await screen.findByLabelText("Compositeur")) as HTMLInputElement).value).toBe("E. Satie");
    expect(api.calls("POST", "/api/sources/pieces/mutopia%3A38/import")).toHaveLength(1);
  });

  it("plays a piece before importing it, and stops it", async () => {
    sourcesApi();
    renderApp("/import/search");

    await userEvent.click(await screen.findByRole("button", { name: "Écouter Gymnopédie No. 2" }));

    const stop = await screen.findByRole("button", { name: "Arrêter Gymnopédie No. 2" });
    await waitFor(() => expect(stop.getAttribute("aria-pressed")).toBe("true"));
    // The first notes are scheduled on the (fake) piano.
    await waitFor(() => expect(played.notes).toBeGreaterThan(0));
    await userEvent.click(stop);
    expect(await screen.findByRole("button", { name: "Écouter Gymnopédie No. 2" })).toBeDefined();
  });
});
