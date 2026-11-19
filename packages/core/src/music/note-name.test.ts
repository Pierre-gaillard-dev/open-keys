import { describe, expect, it } from "vitest";
import { isBlackKey, midiToNoteName, octaveOf, pitchClassName } from "./note-name";

describe("midiToNoteName", () => {
  it.each([
    [60, "C4"],
    [21, "A0"],
    [108, "C8"],
    [61, "C#4"],
    [0, "C-1"],
    [127, "G9"],
  ])("names pitch %i as %s", (pitch, expected) => {
    expect(midiToNoteName(pitch)).toBe(expected);
  });

  it.each([
    [60, "Do3"],
    [21, "La-1"],
    [69, "La3"],
    [64, "Mi3"],
    [66, "Fa#3"],
    [108, "Do7"],
  ])("names pitch %i as %s in French", (pitch, expected) => {
    expect(midiToNoteName(pitch, "latin")).toBe(expected);
  });

  it.each([-1, 128, 60.5, Number.NaN])("rejects invalid pitch %s", (pitch) => {
    expect(() => midiToNoteName(pitch)).toThrow(RangeError);
  });
});

describe("isBlackKey", () => {
  it("detects black keys", () => {
    expect(isBlackKey(61)).toBe(true);
    expect(isBlackKey(70)).toBe(true);
  });

  it("detects white keys", () => {
    expect(isBlackKey(60)).toBe(false);
    expect(isBlackKey(64)).toBe(false);
    expect(isBlackKey(65)).toBe(false);
  });
});

describe("pitchClassName", () => {
  it.each([
    [60, "C"],
    [61, "C#"],
    [71, "B"],
    [21, "A"],
  ])("%i → %s", (pitch, name) => {
    expect(pitchClassName(pitch)).toBe(name);
  });

  it.each([
    [60, "Do"],
    [62, "Ré"],
    [67, "Sol"],
    [70, "La#"],
    [71, "Si"],
  ])("%i → %s in French", (pitch, name) => {
    expect(pitchClassName(pitch, "latin")).toBe(name);
  });
});

describe("octaveOf", () => {
  it("starts the French octave one lower", () => {
    expect(octaveOf(60)).toBe(4);
    expect(octaveOf(60, "latin")).toBe(3);
    expect(octaveOf(59, "latin")).toBe(2);
  });
});
