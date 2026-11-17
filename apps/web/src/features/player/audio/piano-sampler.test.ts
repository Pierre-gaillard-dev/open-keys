import { describe, expect, it } from "vitest";
import { sampleFileName, samplePitches } from "./piano-sampler";

describe("Salamander sample set", () => {
  it("has a sample every minor third from A0 to C8 (30 files)", () => {
    const pitches = samplePitches();

    expect(pitches).toHaveLength(30);
    expect(pitches[0]).toBe(21);
    expect(pitches.at(-1)).toBe(108);
  });

  it.each([
    [21, "A0.mp3"],
    [60, "C4.mp3"],
    [63, "Ds4.mp3"],
    [66, "Fs4.mp3"],
    [108, "C8.mp3"],
  ])("pitch %i → %s", (pitch, file) => {
    expect(sampleFileName(pitch)).toBe(file);
  });
});
