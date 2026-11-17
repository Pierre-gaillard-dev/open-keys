import { DEFAULT_HANDS_SETTINGS, type LibraryEntry } from "@open-keys/contracts";
import { buildMidi, scale } from "@open-keys/core/testing";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installFakeApi } from "../../test/fake-api";
import { songDetail, USER } from "../../test/fixtures";
import { renderApp } from "../../test/render-app";

/** No Web Audio nor WebGL in jsdom: the runtime is replaced by fakes, the rest of the player is real. */
vi.mock("./runtime/browser-runtime", () => ({
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

function playerApi(library: Omit<LibraryEntry, "songId"> | null) {
  const song = songDetail();
  const midi = buildMidi([{ notes: scale(64, 40) }, { channel: 1, notes: scale(40, 20) }]);
  const api = installFakeApi({
    "GET /api/auth/me": () => ({ json: USER }),
    [`GET /api/songs/${song.id}`]: () => ({
      json: { ...song, tracks: song.tracks.map((t, i) => ({ ...t, trackIndex: i })) },
    }),
    [`GET /api/songs/${song.id}/midi`]: () => ({ bytes: midi }),
    "GET /api/library": () => ({ json: library ? [{ ...library, songId: song.id }] : [] }),
    [`PUT /api/library/${song.id}`]: (request) => ({
      json: { songId: song.id, ...(request.body as object) },
    }),
    [`GET /api/songs/${song.id}/loops`]: () => ({ json: [] }),
    [`GET /api/songs/${song.id}/practice-stats`]: () => ({
      json: { songId: song.id, totalActiveMs: 0, sessionCount: 0, lastPracticedAt: null },
    }),
  });
  return { song, api };
}

describe("player", () => {
  it("opens from the song page and resumes where the user stopped", async () => {
    const { song } = playerApi({
      status: "learning",
      isFavorite: false,
      lastPositionMs: 12_000,
      lastTempoPct: 75,
      handsSettings: { ...DEFAULT_HANDS_SETTINGS, left: { audible: false, visible: true } },
      lastLoopId: null,
      lastPracticedAt: null,
      updatedAt: 1,
    });
    renderApp(`/songs/${song.id}`);

    await userEvent.click(await screen.findByRole("link", { name: /Reprendre à 0:12/ }));

    expect(await screen.findByRole("heading", { name: song.title, level: 1 })).toBeDefined();
    expect(await screen.findByText("75 %")).toBeDefined();
    expect(screen.getByRole("button", { name: "Son de la main gauche" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
    expect((screen.getByRole("slider", { name: "Position dans le morceau" }) as HTMLInputElement).value).toBe(
      "12000",
    );
  });

  it("plays, changes speed and hands, then saves the settings when leaving", async () => {
    const { song, api } = playerApi(null);
    renderApp(`/songs/${song.id}/play`);

    const play = await screen.findByRole("button", { name: "Lecture" });
    await waitFor(() => expect(play.hasAttribute("disabled")).toBe(false));
    await userEvent.click(play);
    expect(await screen.findByRole("button", { name: "Pause" })).toBeDefined();

    await userEvent.click(screen.getByRole("button", { name: "Ralentir" }));
    await userEvent.click(screen.getByRole("button", { name: "Ralentir" }));
    const rightSound = screen.getByRole("button", { name: "Son de la main droite" });
    await userEvent.click(rightSound);
    expect(screen.getByText("90 %")).toBeDefined();
    expect(rightSound.getAttribute("aria-pressed")).toBe("false");

    await userEvent.click(screen.getByRole("link", { name: "Quitter le lecteur" }));

    await waitFor(() => expect(api.calls("PUT", `/api/library/${song.id}`).length).toBeGreaterThan(0));
    expect(api.calls("PUT", `/api/library/${song.id}`).at(-1)?.body).toMatchObject({
      lastTempoPct: 90,
      handsSettings: { left: { audible: true, visible: true }, right: { audible: false, visible: true } },
    });
  });

  it("creates an A-B loop from the controls", async () => {
    const { song } = playerApi(null);
    renderApp(`/songs/${song.id}/play`);
    const play = await screen.findByRole("button", { name: "Lecture" });
    await waitFor(() => expect(play.hasAttribute("disabled")).toBe(false));

    await userEvent.click(screen.getByRole("button", { name: "Avancer de 5 secondes" }));
    await userEvent.click(screen.getByRole("button", { name: "Début de boucle (A)" }));
    await userEvent.click(screen.getByRole("button", { name: "Avancer de 5 secondes" }));
    await userEvent.click(screen.getByRole("button", { name: "Fin de boucle (B)" }));

    expect(screen.getByRole("button", { name: "Boucle" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("A 0:05 · B 0:10")).toBeDefined();
    await userEvent.click(screen.getByRole("button", { name: /Boucles/ }));
    const panel = screen.getByRole("region", { name: "Boucles" });
    expect(within(panel).getByRole("button", { name: "Enregistrer la boucle" })).toBeDefined();
  });

  it("saves the loop with a name, then deletes it", async () => {
    const song = songDetail();
    const midi = buildMidi([{ notes: scale(64, 40) }]);
    let loops: object[] = [];
    const api = installFakeApi({
      "GET /api/auth/me": () => ({ json: USER }),
      [`GET /api/songs/${song.id}`]: () => ({
        json: { ...song, tracks: [{ ...song.tracks[0], trackIndex: 0, hand: "right" }] },
      }),
      [`GET /api/songs/${song.id}/midi`]: () => ({ bytes: midi }),
      "GET /api/library": () => ({ json: [] }),
      [`PUT /api/library/${song.id}`]: (request) => ({
        json: { songId: song.id, ...(request.body as object) },
      }),
      [`GET /api/songs/${song.id}/loops`]: () => ({ json: loops }),
      "PUT /api/loops/*": (request) => {
        loops = [{ id: request.path.split("/").at(-1), ...(request.body as object) }];
        return { json: loops[0] };
      },
      "DELETE /api/loops/*": () => {
        loops = [];
        return undefined;
      },
    });
    renderApp(`/songs/${song.id}/play`);
    const play = await screen.findByRole("button", { name: "Lecture" });
    await waitFor(() => expect(play.hasAttribute("disabled")).toBe(false));
    await userEvent.click(screen.getByRole("button", { name: "Début de boucle (A)" }));
    await userEvent.click(screen.getByRole("button", { name: "Avancer de 5 secondes" }));
    await userEvent.click(screen.getByRole("button", { name: "Fin de boucle (B)" }));
    await userEvent.click(screen.getByRole("button", { name: /Boucles/ }));

    await userEvent.type(screen.getByLabelText("Boucle 0:00 – 0:05"), "Intro");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer la boucle" }));

    const saved = await screen.findByRole("button", { name: /^Intro/ });
    expect(api.calls("PUT", `/api/loops/${(loops[0] as { id: string }).id}`)[0]?.body).toMatchObject({
      songId: song.id,
      name: "Intro",
      startMs: 0,
      endMs: 5000,
    });
    expect(saved).toBeDefined();

    await userEvent.click(screen.getByRole("button", { name: "Supprimer la boucle Intro" }));

    await waitFor(() => expect(screen.queryByRole("button", { name: /^Intro/ })).toBeNull());
    expect(screen.getByRole("button", { name: "Boucle" }).hasAttribute("disabled")).toBe(true);
  });
});
