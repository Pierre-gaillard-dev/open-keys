import { describe, expect, it } from "vitest";
import type { MidiTrackSummary } from "../midi";
import type { HandMapping } from "./hands.types";
import { DEFAULT_SPLIT_PITCH, handForNote, suggestHandMapping } from "./suggest-hand-mapping";

function track(index: number, averagePitch: number, isPercussion = false): MidiTrackSummary {
  return {
    index,
    channel: isPercussion ? 9 : 0,
    name: null,
    instrument: null,
    isPercussion,
    noteCount: 10,
    minPitch: averagePitch - 5,
    maxPitch: averagePitch + 5,
    averagePitch,
  };
}

describe("suggestHandMapping", () => {
  it("assigns the highest track to the right hand", () => {
    const mapping = suggestHandMapping([track(0, 45), track(1, 72)]);

    expect(mapping.mode).toBe("tracks");
    expect(mapping.tracks).toEqual([
      { trackIndex: 0, hand: "left" },
      { trackIndex: 1, hand: "right" },
    ]);
  });

  it("sends every other track to the left hand", () => {
    const mapping = suggestHandMapping([track(1, 70), track(2, 50), track(3, 40)]);

    expect(mapping.tracks.map((t) => t.hand)).toEqual(["right", "left", "left"]);
  });

  it("ignores percussion and does not count it as a playable track", () => {
    const mapping = suggestHandMapping([track(0, 64), track(1, 40, true)]);

    expect(mapping.mode).toBe("split");
    expect(mapping.tracks).toEqual([
      { trackIndex: 0, hand: "right" },
      { trackIndex: 1, hand: "ignore" },
    ]);
  });

  it("splits a single track at middle C", () => {
    const mapping = suggestHandMapping([track(0, 55)]);

    expect(mapping).toEqual({
      mode: "split",
      splitPitch: DEFAULT_SPLIT_PITCH,
      tracks: [{ trackIndex: 0, hand: "left" }],
    });
  });
});

describe("handForNote", () => {
  const byTracks: HandMapping = {
    mode: "tracks",
    splitPitch: 60,
    tracks: [
      { trackIndex: 0, hand: "right" },
      { trackIndex: 1, hand: "ignore" },
    ],
  };

  it("uses the track hand in tracks mode", () => {
    expect(handForNote(byTracks, 0, 30)).toBe("right");
  });

  it("returns undefined for ignored or unknown tracks", () => {
    expect(handForNote(byTracks, 1, 60)).toBeUndefined();
    expect(handForNote(byTracks, 7, 60)).toBeUndefined();
  });

  it("splits by pitch in split mode", () => {
    const split: HandMapping = { mode: "split", splitPitch: 62, tracks: [{ trackIndex: 0, hand: "left" }] };

    expect(handForNote(split, 0, 62)).toBe("right");
    expect(handForNote(split, 0, 61)).toBe("left");
  });
});
