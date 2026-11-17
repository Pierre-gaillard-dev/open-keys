import { describe, expect, it } from "vitest";
import { buildMidi, scale } from "./midi-fixtures";
import { parseMidiNotes } from "./parse-notes";

const beatsOf = (bytes: Uint8Array) => parseMidiNotes(bytes).beats;

describe("beatGrid", () => {
  it("clicks every quarter note in 4/4 at 120 bpm when the file says nothing", () => {
    const beats = beatsOf(buildMidi([{ notes: scale(60, 8) }]));

    expect(beats.slice(0, 5).map((beat) => [beat.time, beat.downbeat, beat.beatsInBar])).toEqual([
      [0, true, 4],
      [0.5, false, 4],
      [1, false, 4],
      [1.5, false, 4],
      [2, true, 4],
    ]);
    // Covers the whole piece (4 s), with one more beat to end on.
    expect(beats.at(-1)?.time).toBeGreaterThanOrEqual(3.5);
  });

  it("follows the tempo and the time signature of the file", () => {
    const beats = beatsOf(buildMidi([{ notes: scale(60, 6) }], "", { bpm: 90, timeSignature: [3, 4] }));

    expect(beats[1]?.time).toBeCloseTo(60 / 90);
    expect(beats.slice(0, 4).map((beat) => beat.downbeat)).toEqual([true, false, false, true]);
    expect(beats[0]?.beatsInBar).toBe(3);
  });

  it("clicks eighth notes in 6/8", () => {
    const beats = beatsOf(buildMidi([{ notes: scale(60, 4) }], "", { bpm: 120, timeSignature: [6, 8] }));

    expect(beats[1]?.time).toBeCloseTo(0.25);
    expect(beats[6]?.downbeat).toBe(true);
  });
});
