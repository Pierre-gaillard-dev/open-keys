import { describe, expect, it } from "vitest";
import { createPlayerStore } from "../stores/player.store";
import { libraryPatchFor, sessionRequestFor } from "./use-practice-persistence";

const session = { startedAt: 1000, endedAt: 61_000, activeMs: 45_000, minTempoPct: 50, maxTempoPct: 75 };

function playerState() {
  const store = createPlayerStore({ durationMs: 180_000, positionMs: 42_000, tempoPct: 75 });
  store.setState({
    loop: { startMs: 1000, endMs: 5000, id: "01JD0000000000000000000L01", name: null },
    loopEnabled: true,
  });
  return store.getState();
}

describe("libraryPatchFor", () => {
  it("saves position, speed, hands and the active saved loop", () => {
    expect(libraryPatchFor(playerState(), null, "learning")).toMatchObject({
      lastPositionMs: 42_000,
      lastTempoPct: 75,
      lastLoopId: "01JD0000000000000000000L01",
    });
  });

  it("marks a song to learn as being learned once practised", () => {
    expect(libraryPatchFor(playerState(), session, "to_learn")).toMatchObject({
      status: "learning",
      lastPracticedAt: 61_000,
    });
    expect(libraryPatchFor(playerState(), session, "mastered").status).toBeUndefined();
  });

  it("does not touch the practice date without a recorded session", () => {
    expect(libraryPatchFor(playerState(), null, "to_learn")).not.toHaveProperty("lastPracticedAt");
  });
});

describe("sessionRequestFor", () => {
  it("builds a watch-mode session with the active loop", () => {
    expect(sessionRequestFor("01JD0000000000000000000S01", playerState(), session)).toMatchObject({
      songId: "01JD0000000000000000000S01",
      loopId: "01JD0000000000000000000L01",
      mode: "watch",
      activeMs: 45_000,
      minTempoPct: 50,
      maxTempoPct: 75,
      accuracy: null,
    });
  });
});
