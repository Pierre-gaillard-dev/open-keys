import { describe, expect, it } from "vitest";
import { isBlackKey, midiToNoteName } from "./note-name";

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
