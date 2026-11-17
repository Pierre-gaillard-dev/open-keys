import { onlineManager } from "@tanstack/react-query";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { midiCache, outbox } from "../shared/offline";
import { installFakeApi, NETWORK_ERROR } from "../test/fake-api";
import { songDetail, USER } from "../test/fixtures";
import { renderApp } from "../test/render-app";

/** No Web Audio nor WebGL in jsdom (see player-flow.test.tsx). */
vi.mock("../features/player/runtime/browser-runtime", () => ({
  createBrowserRuntime: () => ({
    audio: { currentTime: 0, baseLatency: 0, outputLatency: 0, resume: () => Promise.resolve() },
    output: { play: () => undefined, stopAll: () => undefined },
    loadSamples: () => Promise.resolve(),
    createRenderer: () => ({
      init: () => Promise.resolve(),
      setOptions: () => undefined,
      destroy: () => undefined,
    }),
    close: () => undefined,
  }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

function goOffline() {
  act(() => onlineManager.setOnline(false));
}

describe("offline (UC-14, UC-15)", () => {
  it("lists only the songs stored on the device, with a notice", async () => {
    const stored = songDetail({ title: "Gymnopédie" });
    const other = songDetail({ title: "Nocturne" });
    installFakeApi({
      "GET /api/auth/me": () => ({ json: USER }),
      "GET /api/songs": () => ({ json: [stored, other] }),
      "GET /api/tags": () => ({ json: [] }),
      "GET /api/library": () => ({ json: [] }),
      [`GET ${stored.midiUrl}`]: () => ({ bytes: new Uint8Array([1]) }),
    });
    await midiCache.get(stored);
    renderApp("/");
    const list = await screen.findByRole("region", { name: "Morceaux" });
    expect(within(list).getAllByRole("link")).toHaveLength(2);

    goOffline();

    expect(await screen.findByText("Hors-ligne.")).toBeDefined();
    await waitFor(() =>
      expect(within(screen.getByRole("region", { name: "Morceaux" })).getAllByRole("link")).toHaveLength(1),
    );
    expect(screen.getByRole("link", { name: /Gymnopédie/ })).toBeDefined();
  });

  it("applies a change at once offline and sends it when the network comes back", async () => {
    const song = songDetail();
    let reachable = true;
    const api = installFakeApi({
      "GET /api/auth/me": () => ({ json: USER }),
      [`GET /api/songs/${song.id}`]: () => ({ json: song }),
      "GET /api/library": () => ({ json: [] }),
      [`GET /api/songs/${song.id}/loops`]: () => ({ json: [] }),
      [`GET /api/songs/${song.id}/practice-stats`]: () => ({
        json: { songId: song.id, totalActiveMs: 0, sessionCount: 0, lastPracticedAt: null },
      }),
      [`PUT /api/library/${song.id}`]: (request) =>
        reachable ? { json: { songId: song.id, ...(request.body as object) } } : NETWORK_ERROR,
      "GET /api/health": () => ({ json: { status: "ok", version: "test" } }),
      [`GET ${song.midiUrl}`]: () => ({ bytes: new Uint8Array([1]) }),
    });
    const stop = outbox.start();
    renderApp(`/songs/${song.id}`);
    const favorite = await screen.findByRole("button", { name: "Ajouter aux favoris" });

    reachable = false;
    goOffline();
    await userEvent.click(favorite);

    expect(screen.getByRole("button", { name: "Retirer des favoris" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(
      await screen.findByRole("status", { name: "Hors-ligne, 1 modification en attente" }),
    ).toBeDefined();
    expect(api.calls("PUT", `/api/library/${song.id}`)).toHaveLength(0);
    expect(outbox.state.getState().pending).toBe(1);

    reachable = true;
    // Back online (browser event or API probe): the outbox is sent at once.
    act(() => onlineManager.setOnline(true));

    await waitFor(() => expect(api.calls("PUT", `/api/library/${song.id}`)).toHaveLength(1));
    expect(api.calls("PUT", `/api/library/${song.id}`)[0]?.body).toMatchObject({ isFavorite: true });
    await waitFor(() => expect(outbox.state.getState().pending).toBe(0));
    await waitFor(() =>
      expect(screen.queryByRole("status", { name: /Hors-ligne|Synchronisation/ })).toBeNull(),
    );
    stop();
  });

  it("says that a song never opened on this device is not available offline", async () => {
    const song = songDetail();
    installFakeApi({
      "GET /api/auth/me": () => ({ json: USER }),
      [`GET /api/songs/${song.id}`]: () => ({ json: song }),
      "GET /api/library": () => ({ json: [] }),
      [`GET /api/songs/${song.id}/loops`]: () => ({ json: [] }),
      [`GET ${song.midiUrl}`]: () => NETWORK_ERROR,
    });
    renderApp(`/songs/${song.id}/play`);

    expect(await screen.findByText("Ce morceau n'est pas disponible hors-ligne.")).toBeDefined();
  });
});
