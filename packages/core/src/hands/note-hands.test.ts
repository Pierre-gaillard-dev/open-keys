import { describe, expect, it } from "vitest";
import type { ParsedNote } from "../midi/parse-notes";
import { buildTimeline } from "../timeline/timeline";
import type { HandMapping } from "./hands.types";
import { decodeNoteHands, encodeNoteHands, notesFingerprint, separateNoteHands } from "./note-hands";

function note(trackIndex: number, ticks: number, pitch: number): ParsedNote {
  const start = ticks / 480;
  return { trackIndex, ticks, pitch, start, end: start + 0.4, soundEnd: start + 0.4, velocity: 0.8 };
}

const notes = [note(0, 0, 72), note(0, 0, 48), note(1, 480, 50), note(0, 480, 74), note(2, 0, 38)];
const mapping: HandMapping = {
  mode: "tracks",
  splitPitch: 60,
  tracks: [
    { trackIndex: 0, hand: "right" },
    { trackIndex: 1, hand: "left" },
    { trackIndex: 2, hand: "ignore" },
  ],
};

describe("note hands", () => {
  it("decodes what it encoded, whatever the order of the notes", () => {
    const hands = ["right", "left", "left", "right", undefined] as const;
    const encoded = encodeNoteHands(notes, hands);

    expect(encoded.hands).toBe("lrrl-");
    expect(decodeNoteHands(notes, encoded)).toEqual(hands);

    const reversed = [...notes].reverse();
    expect(decodeNoteHands(reversed, encoded)).toEqual([...hands].reverse());
  });

  it("refuses an assignment made for other notes", () => {
    const encoded = encodeNoteHands(notes, ["right", "left", "left", "right", undefined]);

    expect(decodeNoteHands(notes.slice(1), encoded)).toBeNull();
    const moved = notes.map((n, index) => (index === 0 ? { ...n, pitch: 73 } : n));
    expect(decodeNoteHands(moved, encoded)).toBeNull();
    expect(notesFingerprint(moved)).not.toBe(encoded.fingerprint);
  });

  it("separates the notes of the played tracks only, whatever their track's hand", () => {
    const hands = separateNoteHands(notes, mapping);

    expect(hands[4]).toBeUndefined();
    // Track 0 holds both hands: its low C goes left.
    expect(hands.slice(0, 4)).toEqual(["right", "left", "left", "right"]);
  });

  it("lets the timeline take the hand of each note from the assignment", () => {
    const parsed = { durationS: 2, notes, beats: [] };
    const timeline = buildTimeline(parsed, mapping, ["left", "left", "right", "right", undefined]);

    expect(timeline.notes.map((n) => [n.pitch, n.hand])).toEqual([
      [72, "left"],
      [48, "left"],
      [50, "right"],
      [74, "right"],
    ]);
  });
});
