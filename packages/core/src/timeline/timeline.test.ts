import { describe, expect, it } from "vitest";
import type { HandMapping } from "../hands";
import { buildMidi, scale } from "../midi/midi-fixtures";
import { parseMidiNotes } from "../midi/parse-notes";
import { buildTimeline, countInAt, firstNoteIndexAtOrAfter, notesInWindow } from "./timeline";

const byTracks: HandMapping = {
  mode: "tracks",
  splitPitch: 60,
  tracks: [
    { trackIndex: 0, hand: "right" },
    { trackIndex: 1, hand: "left" },
    { trackIndex: 2, hand: "ignore" },
  ],
};

function threeTrackSong() {
  return parseMidiNotes(
    buildMidi([
      { notes: scale(64, 4) },
      { notes: scale(40, 2) },
      { notes: [{ pitch: 90, time: 0, duration: 4 }] },
    ]),
  );
}

describe("buildTimeline", () => {
  it("applies the hand mapping and drops ignored tracks", () => {
    const timeline = buildTimeline(threeTrackSong(), byTracks);

    expect(timeline.notes.map((note) => [note.pitch, note.hand])).toEqual([
      [40, "left"],
      [64, "right"],
      [41, "left"],
      [65, "right"],
      [66, "right"],
      [67, "right"],
    ]);
    expect(timeline).toMatchObject({ minPitch: 40, maxPitch: 67, maxNoteDuration: 0.5 });
  });

  it("splits by pitch in split mode", () => {
    const parsed = parseMidiNotes(
      buildMidi([{ notes: [58, 59, 60, 61].map((pitch, i) => ({ pitch, time: i, duration: 1 })) }]),
    );
    const split: HandMapping = { mode: "split", splitPitch: 60, tracks: [{ trackIndex: 0, hand: "right" }] };

    expect(buildTimeline(parsed, split).notes.map((note) => note.hand)).toEqual([
      "left",
      "left",
      "right",
      "right",
    ]);
  });
});

describe("firstNoteIndexAtOrAfter", () => {
  const notes = [0, 1, 1, 2, 5].map((start) => ({ start }));

  it.each([
    [-1, 0],
    [0, 0],
    [1, 1],
    [1.5, 3],
    [5, 4],
    [6, 5],
  ])("time %d → index %d", (time, index) => {
    expect(firstNoteIndexAtOrAfter(notes, time)).toBe(index);
  });
});

describe("notesInWindow", () => {
  it("returns notes still sounding and notes about to start", () => {
    const parsed = parseMidiNotes(
      buildMidi([
        {
          notes: [
            { pitch: 60, time: 0, duration: 3 },
            { pitch: 62, time: 1, duration: 0.5 },
            { pitch: 64, time: 2.5, duration: 1 },
            { pitch: 65, time: 10, duration: 1 },
          ],
        },
      ]),
    );
    const timeline = buildTimeline(parsed, {
      mode: "tracks",
      splitPitch: 60,
      tracks: [{ trackIndex: 0, hand: "right" }],
    });

    expect(notesInWindow(timeline, 2, 4).map((note) => note.pitch)).toEqual([60, 64]);
  });
});

describe("countInAt", () => {
  const beats = [0, 0.5, 1, 1.5, 2, 2.6, 3.2].map((time, index) => ({
    time,
    downbeat: index % 4 === 0,
    beatsInBar: index < 4 ? 4 : 3,
  }));

  it("is one bar of the meter and tempo at the position", () => {
    expect(countInAt(beats, 0)).toEqual({ beats: 4, beatS: 0.5 });
    expect(countInAt(beats, 1.2)).toEqual({ beats: 4, beatS: 0.5 });
    expect(countInAt(beats, 2)).toEqual({ beats: 3, beatS: expect.closeTo(0.6) });
  });

  it("uses the last known beat after the end, and 4 beats at 120 bpm without a grid", () => {
    expect(countInAt(beats, 10)).toEqual({ beats: 3, beatS: expect.closeTo(0.6) });
    expect(countInAt([], 0)).toEqual({ beats: 4, beatS: 0.5 });
  });
});
