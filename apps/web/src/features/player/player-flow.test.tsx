import { DEFAULT_HANDS_SETTINGS, type LibraryEntry } from "@open-keys/contracts";
import { buildMidi, scale } from "@open-keys/core/testing";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
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
    clicks: { click: () => undefined, stopAll: () => undefined },
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
      handsSettings: { ...DEFAULT_HANDS_SETTINGS, left: { audible: false, visible: true, volume: 1 } },
      lastLoopId: null,
      lastPracticedAt: null,
      updatedAt: 1,
    });
    renderApp(`/songs/${song.id}`);

    await userEvent.click(await screen.findByRole("link", { name: /Reprendre à 0:12/ }));

    expect(await screen.findByRole("heading", { name: song.title, level: 1 })).toBeDefined();
    expect((await screen.findByTestId("tempo-badge")).textContent).toBe("75 %");
    await userEvent.click(screen.getByRole("button", { name: "Réglages du lecteur" }));
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

    // Speed and hands are in the settings, which stay shown while playing.
    await userEvent.click(screen.getByRole("button", { name: "Réglages du lecteur" }));
    const panel = screen.getByRole("region", { name: "Réglages du lecteur" });
    await userEvent.click(within(panel).getByRole("button", { name: "Ralentir" }));
    await userEvent.click(within(panel).getByRole("button", { name: "Ralentir" }));
    const rightSound = within(panel).getByRole("button", { name: "Son de la main droite" });
    await userEvent.click(rightSound);
    expect(within(panel).getByText("90 %")).toBeDefined();
    expect(screen.getByTestId("tempo-badge").textContent).toBe("90 %");
    expect(screen.getByTestId("player-controls").dataset["visible"]).toBe("true");
    expect(rightSound.getAttribute("aria-pressed")).toBe("false");

    await userEvent.click(screen.getByRole("link", { name: "Quitter le lecteur" }));

    await waitFor(() => expect(api.calls("PUT", `/api/library/${song.id}`).length).toBeGreaterThan(0));
    expect(api.calls("PUT", `/api/library/${song.id}`).at(-1)?.body).toMatchObject({
      lastTempoPct: 90,
      handsSettings: { left: { audible: true, visible: true }, right: { audible: false, visible: true } },
    });
  });

  it("hides the controls when playing and on a tap on an empty area, shows them on a tap", async () => {
    const { song } = playerApi(null);
    renderApp(`/songs/${song.id}/play`);
    const play = await screen.findByRole("button", { name: "Lecture" });
    await waitFor(() => expect(play.hasAttribute("disabled")).toBe(false));
    const controls = screen.getByTestId("player-controls");

    // A finger set on the text of a panel (to scroll it) keeps it open.
    await userEvent.click(screen.getByRole("button", { name: "Réglages du lecteur" }));
    const panel = screen.getByRole("region", { name: "Réglages du lecteur" });
    await userEvent.pointer({
      keys: "[TouchA]",
      target: within(panel).getByRole("heading", { name: "Réglages" }),
    });
    expect(screen.getByRole("region", { name: "Réglages du lecteur" })).toBeTruthy();
    // A finger scrolling from an empty area (it moves, or the browser cancels it) closes nothing.
    await userEvent.pointer([
      { keys: "[TouchA>]", target: controls, coords: { x: 50, y: 300 } },
      { pointerName: "TouchA", target: controls, coords: { x: 50, y: 200 } },
      { keys: "[/TouchA]", target: controls, coords: { x: 50, y: 200 } },
    ]);
    fireEvent.pointerDown(controls, { pointerId: 7 });
    fireEvent.pointerCancel(controls, { pointerId: 7 });
    fireEvent.pointerUp(controls, { pointerId: 7 });
    expect(screen.getByRole("region", { name: "Réglages du lecteur" })).toBeTruthy();
    // With a panel open, a tap on an empty area closes the panel first.
    await userEvent.click(controls);
    expect(screen.queryByRole("region", { name: "Réglages du lecteur" })).toBeNull();
    expect(controls.dataset["visible"]).toBe("true");
    await userEvent.click(controls);
    expect(controls.dataset["visible"]).toBe("false");
    // The mouse still moving right after the tap does not bring them back.
    await userEvent.pointer({ coords: { x: 10, y: 10 }, target: screen.getByTestId("player-canvas") });
    expect(controls.dataset["visible"]).toBe("false");
    // A finger (no pointer move before the tap, unlike a mouse).
    await userEvent.pointer({ keys: "[TouchA]", target: screen.getByTestId("player-canvas") });
    expect(controls.dataset["visible"]).toBe("true");

    await userEvent.click(play);
    await waitFor(() => expect(controls.dataset["visible"]).toBe("false"));
  });

  it("turns the wait mode on from the settings, and says when the microphone cannot open", async () => {
    const { song } = playerApi(null);
    renderApp(`/songs/${song.id}/play`);
    const play = await screen.findByRole("button", { name: "Lecture" });
    await waitFor(() => expect(play.hasAttribute("disabled")).toBe(false));

    await userEvent.click(screen.getByRole("button", { name: "Réglages du lecteur" }));
    const panel = screen.getByRole("region", { name: "Réglages du lecteur" });
    await userEvent.click(within(panel).getByRole("radio", { name: "Main droite" }));
    expect(within(panel).getByRole("radio", { name: "Main droite" }).getAttribute("aria-checked")).toBe(
      "true",
    );
    // No microphone in the test environment.
    await userEvent.click(within(panel).getByRole("button", { name: /^Attendre que je joue/ }));
    expect(await within(panel).findByRole("alert")).toBeDefined();
    expect(within(panel).getByText(/Micro indisponible/)).toBeDefined();
  });

  it("keeps count-in, metronome and note names on the device, the hand volume with the song", async () => {
    localStorage.clear();
    const { song, api } = playerApi(null);
    renderApp(`/songs/${song.id}/play`);
    const play = await screen.findByRole("button", { name: "Lecture" });
    await waitFor(() => expect(play.hasAttribute("disabled")).toBe(false));

    await userEvent.click(screen.getByRole("button", { name: "Réglages du lecteur" }));
    const panel = screen.getByRole("region", { name: "Réglages du lecteur" });
    await userEvent.click(within(panel).getByRole("button", { name: /^Métronome/ }));
    await userEvent.click(within(panel).getByRole("radio", { name: "Touches" }));
    fireEvent.change(within(panel).getByRole("slider", { name: "Volume main gauche" }), {
      target: { value: "40" },
    });

    expect(
      within(panel)
        .getByRole("button", { name: /^Métronome/ })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(JSON.parse(localStorage.getItem("open-keys:player-preferences") ?? "{}")).toEqual({
      countIn: false,
      metronome: true,
      noteNames: "keys",
    });

    await userEvent.click(screen.getByRole("link", { name: "Quitter le lecteur" }));
    await waitFor(() => expect(api.calls("PUT", `/api/library/${song.id}`).length).toBeGreaterThan(0));
    expect(api.calls("PUT", `/api/library/${song.id}`).at(-1)?.body).toMatchObject({
      handsSettings: { left: { volume: 0.4 }, right: { volume: 1 } },
    });
  });

  it("creates an A-B loop from the controls", async () => {
    const { song } = playerApi(null);
    renderApp(`/songs/${song.id}/play`);
    const play = await screen.findByRole("button", { name: "Lecture" });
    await waitFor(() => expect(play.hasAttribute("disabled")).toBe(false));

    await userEvent.click(screen.getByRole("button", { name: "Avancer de 5 secondes" }));
    await userEvent.click(screen.getByRole("button", { name: /Boucles/ }));
    const panel = screen.getByRole("region", { name: "Boucles" });
    await userEvent.click(within(panel).getByRole("button", { name: "Début de boucle (A)" }));
    await userEvent.click(screen.getByRole("button", { name: "Avancer de 5 secondes" }));
    await userEvent.click(within(panel).getByRole("button", { name: "Fin de boucle (B)" }));

    expect(within(panel).getByRole("button", { name: "Boucle" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("A 0:05 · B 0:10")).toBeDefined();
    expect(within(panel).getByRole("button", { name: "Enregistrer la boucle" })).toBeDefined();
  });

  it("saves the loop with a name, then deletes it (soft delete, synchronised in the background)", async () => {
    const song = songDetail();
    const midi = buildMidi([{ notes: scale(64, 40) }]);
    // Server side: soft-deleted loops are not listed.
    const loops = new Map<string, { deletedAt: number | null }>();
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
      [`GET /api/songs/${song.id}/loops`]: () => ({
        json: [...loops.values()].filter((loop) => loop.deletedAt === null),
      }),
      "PUT /api/loops/*": (request) => {
        const loop = {
          id: request.path.split("/").at(-1),
          ...(request.body as { deletedAt: number | null }),
        };
        loops.set(request.path, loop);
        return { json: loop };
      },
    });
    const loopWrites = () =>
      api.requests.filter((r) => r.method === "PUT" && r.path.startsWith("/api/loops/"));
    renderApp(`/songs/${song.id}/play`);
    const play = await screen.findByRole("button", { name: "Lecture" });
    await waitFor(() => expect(play.hasAttribute("disabled")).toBe(false));
    await userEvent.click(screen.getByRole("button", { name: /Boucles/ }));
    await userEvent.click(screen.getByRole("button", { name: "Début de boucle (A)" }));
    await userEvent.click(screen.getByRole("button", { name: "Avancer de 5 secondes" }));
    await userEvent.click(screen.getByRole("button", { name: "Fin de boucle (B)" }));

    await userEvent.type(screen.getByLabelText("Boucle 0:00 – 0:05"), "Intro");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer la boucle" }));

    expect(await screen.findByRole("button", { name: /^Intro/ })).toBeDefined();
    await waitFor(() => expect(loopWrites()).toHaveLength(1));
    expect(loopWrites()[0]?.body).toMatchObject({
      songId: song.id,
      name: "Intro",
      startMs: 0,
      endMs: 5000,
      deletedAt: null,
    });

    await userEvent.click(screen.getByRole("button", { name: "Supprimer la boucle Intro" }));

    await waitFor(() => expect(screen.queryByRole("button", { name: /^Intro/ })).toBeNull());
    expect(screen.getByRole("button", { name: "Boucle" }).hasAttribute("disabled")).toBe(true);
    await waitFor(() => expect(loopWrites()).toHaveLength(2));
    expect(loopWrites()[1]?.path).toBe(loopWrites()[0]?.path);
    expect(loopWrites()[1]?.body).toMatchObject({ name: "Intro", deletedAt: expect.any(Number) });
  });
});
