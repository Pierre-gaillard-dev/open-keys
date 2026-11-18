import { describe, expect, it } from "vitest";
import { type HandNote, separateHands } from "./separate-hands";

/** Notes of one line, one every `step` seconds. */
function line(pitches: readonly number[], step = 0.5, offset = 0): HandNote[] {
  return pitches.map((pitch, index) => ({
    pitch,
    start: offset + index * step,
    end: offset + (index + 1) * step,
  }));
}

const handsOf = (notes: readonly HandNote[]) => separateHands(notes).join(",");

describe("separateHands", () => {
  it("gives a bass line to the left hand and a melody to the right one", () => {
    const bass = line([36, 43, 40, 43, 36, 43, 40, 43]);
    const melody = line([72, 74, 76, 77, 79, 77, 76, 74]);

    const hands = separateHands([...bass, ...melody]);

    expect(hands.slice(0, 8).every((hand) => hand === "left")).toBe(true);
    expect(hands.slice(8).every((hand) => hand === "right")).toBe(true);
  });

  it("keeps a melody in the right hand when it goes below middle C", () => {
    const bass = line([36, 36, 38, 38, 40, 40, 41, 41]);
    const melody = line([67, 65, 64, 62, 60, 59, 57, 55]);

    const hands = separateHands([...bass, ...melody]);

    expect(hands.slice(8)).toEqual(Array(8).fill("right"));
  });

  it("keeps an accompaniment in the left hand when it goes above middle C", () => {
    const accompaniment = line([55, 59, 62, 64, 62, 59, 55, 52]);
    const melody = line([79, 81, 83, 84, 83, 81, 79, 76]);

    expect(separateHands([...accompaniment, ...melody]).slice(0, 8)).toEqual(Array(8).fill("left"));
  });

  it("splits a ten-note chord five and five, lower notes left", () => {
    const chord = [36, 40, 43, 48, 52, 60, 64, 67, 72, 76].map((pitch) => ({ pitch, start: 0, end: 1 }));

    expect(handsOf(chord)).toBe("left,left,left,left,left,right,right,right,right,right");
  });

  it("does not ask one hand to stretch over two octaves", () => {
    // A held low C and a high C, together: two hands.
    const notes = [
      { pitch: 36, start: 0, end: 2 },
      { pitch: 60, start: 0, end: 2 },
    ];

    expect(handsOf(notes)).toBe("left,right");
  });

  it("returns one hand per note, in the order of the input", () => {
    const notes = [...line([76, 77], 0.5, 0), { pitch: 40, start: 0.1, end: 1 }];

    expect(separateHands(notes)).toEqual(["right", "right", "left"]);
    expect(separateHands([])).toEqual([]);
  });
});
