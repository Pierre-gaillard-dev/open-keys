import type { SongDetail } from "@open-keys/contracts";
import { buildMidi, scale } from "@open-keys/core/testing";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installFakeApi } from "../../test/fake-api";
import { songDetail, USER } from "../../test/fixtures";
import { renderApp } from "../../test/render-app";

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A PC: wide screen and a mouse, the corrections are allowed. */
function onPc() {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: true, addEventListener: () => undefined, removeEventListener: () => undefined })),
  );
}

describe("hand corrections on PC (D28)", () => {
  it("switches an older song to the per-note mode, corrects a note and saves it", async () => {
    onPc();
    const song = songDetail();
    // Tracks 1 (upper) and 2 (lower); track 0 is the empty conductor track.
    const midi = buildMidi([{ notes: [] }, { notes: scale(67, 6) }, { notes: scale(43, 6) }]);
    let stored: SongDetail = song;
    const api = installFakeApi({
      "GET /api/auth/me": () => ({ json: USER }),
      [`GET /api/songs/${song.id}`]: () => ({ json: stored }),
      [`GET /api/songs/${song.id}/midi`]: () => ({ bytes: midi }),
      [`PATCH /api/songs/${song.id}`]: (request) => {
        const { noteHands, ...fields } = request.body as { noteHands: object };
        stored = {
          ...song,
          ...fields,
          noteHands: { ...(noteHands as SongDetail["noteHands"] & object), updatedAt: 2 },
        };
        return { json: stored };
      },
      [`GET /api/songs/${song.id}/practice-stats`]: () => ({
        json: { songId: song.id, totalActiveMs: 0, sessionCount: 0, lastPracticedAt: null },
      }),
      [`GET /api/songs/${song.id}/loops`]: () => ({ json: [] }),
      "GET /api/library": () => ({ json: [] }),
      "GET /api/tags": () => ({ json: [] }),
    });
    renderApp(`/songs/${song.id}/edit`);

    await userEvent.click(await screen.findByRole("radio", { name: "Note par note" }));
    const roll = await screen.findByRole("img", { name: /6 notes à gauche, 6 à droite/ });

    // A rectangle over the first beat (40 px per second): the first note of each hand.
    fireEvent.pointerDown(roll, { clientX: 0, clientY: 0, button: 0, pointerId: 1 });
    fireEvent.pointerMove(roll, { clientX: 15, clientY: 320, pointerId: 1 });
    fireEvent.pointerUp(roll, { clientX: 15, clientY: 320, pointerId: 1 });
    expect(screen.getByText("2 notes sélectionnées")).toBeDefined();
    await userEvent.click(screen.getByRole("button", { name: "Main gauche" }));

    expect(screen.getByRole("img", { name: /7 notes à gauche, 5 à droite/ })).toBeDefined();
    expect(screen.getByText("Répartition corrigée à la main.")).toBeDefined();
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(api.calls("PATCH", `/api/songs/${song.id}`)).toHaveLength(1));
    expect(api.calls("PATCH", `/api/songs/${song.id}`)[0]?.body).toMatchObject({
      handMode: "split",
      noteHands: { hands: "lrrrrrllllll", source: "edited", version: 1 },
    });
  });
});
