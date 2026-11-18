import { encodeNoteHands, type HandMapping, type ParsedNote } from "@open-keys/core";
import { describe, expect, it } from "vitest";
import { songDetail } from "../../test/fixtures";
import { effectiveHands, noteHandsRequest, withHand, withPlayedTracks } from "./hands-assignment";

function note(trackIndex: number, ticks: number, pitch: number): ParsedNote {
  const start = ticks / 480;
  return { trackIndex, ticks, pitch, start, end: start + 0.5, soundEnd: start + 0.5, velocity: 0.8 };
}

const notes = [note(1, 0, 72), note(2, 0, 40), note(1, 480, 74), note(2, 480, 43)];
const mapping = (lower: "left" | "ignore"): HandMapping => ({
  mode: "tracks",
  splitPitch: 60,
  tracks: [
    { trackIndex: 1, hand: "right" },
    { trackIndex: 2, hand: lower },
  ],
});

describe("hands assignment (D28)", () => {
  it("computes the hands of a new import, and uses the stored ones of a saved song", () => {
    const song = songDetail();
    expect(effectiveHands({ kind: "auto" }, song, notes, mapping("left"))).toEqual([
      "right",
      "left",
      "right",
      "left",
    ]);

    const stored = {
      ...encodeNoteHands(notes, ["left", "left", "right", "left"]),
      source: "edited" as const,
    };
    const saved = songDetail({ noteHands: { ...stored, version: 1, updatedAt: 1 } });
    expect(effectiveHands({ kind: "stored" }, saved, notes, mapping("left"))[0]).toBe("left");
  });

  it("keeps the corrections when a track is ignored, then played again", () => {
    const corrected = withHand(["right", "left", "right", "left"], [2], "left");
    expect(corrected).toMatchObject({
      kind: "edited",
      source: "edited",
      hands: ["right", "left", "left", "left"],
    });
    if (corrected.kind !== "edited") {
      throw new Error("edited expected");
    }

    const ignored = withPlayedTracks(corrected, corrected.hands, notes, mapping("ignore"), songDetail());
    expect(ignored).toMatchObject({ hands: ["right", undefined, "left", undefined], source: "edited" });
    if (ignored.kind !== "edited") {
      throw new Error("edited expected");
    }
    const playedAgain = withPlayedTracks(ignored, ignored.hands, notes, mapping("left"), songDetail());
    expect(playedAgain).toMatchObject({ hands: ["right", "left", "left", "left"] });
  });

  it("sends nothing for an untouched stored assignment, null outside the per-note mode", () => {
    const hands = ["right", "left", "right", "left"] as const;

    expect(noteHandsRequest("auto", { kind: "stored" }, hands, notes)).toBeUndefined();
    expect(noteHandsRequest("tracks", { kind: "auto" }, hands, notes)).toBeNull();
    expect(noteHandsRequest("auto", { kind: "auto" }, hands, notes)).toMatchObject({
      hands: "rrll",
      source: "auto",
      version: 1,
    });
  });
});
