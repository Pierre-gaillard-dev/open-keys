import { describe, expect, it } from "vitest";
import { Spectrum } from "./fft";
import { NoteListener } from "./note-listener";
import { PitchDetector } from "./pitch-detector";

const SAMPLE_RATE = 48_000;
const SIZE = 8192;

/** A piano-like note: harmonics decaying as 1/h, slightly stretched (inharmonicity). */
function tone(pitches: readonly number[], length = SIZE): Float64Array {
  const samples = new Float64Array(length);
  for (const pitch of pitches) {
    const f0 = 440 * 2 ** ((pitch - 69) / 12);
    for (let h = 1; h <= 10; h++) {
      const frequency = f0 * h * Math.sqrt(1 + 0.0002 * h * h);
      if (frequency >= SAMPLE_RATE / 2) {
        break;
      }
      for (let i = 0; i < length; i++) {
        samples[i] =
          (samples[i] as number) + (0.2 / h) * Math.sin((2 * Math.PI * frequency * i) / SAMPLE_RATE);
      }
    }
  }
  return samples;
}

const detector = new PitchDetector({ sampleRate: SAMPLE_RATE });
const spectrum = new Spectrum(SIZE);
const verify = (played: readonly number[], expected: readonly number[]) =>
  detector.verify(spectrum.compute(tone(played)), expected);

describe("Spectrum", () => {
  it("puts a sine in its bin", () => {
    const bin = 300;
    const sine = Float64Array.from({ length: SIZE }, (_, i) => Math.sin((2 * Math.PI * bin * i) / SIZE));
    const magnitudes = spectrum.compute(sine);
    const peak = magnitudes.indexOf(Math.max(...magnitudes));
    expect(peak).toBe(bin);
  });
});

describe("PitchDetector.verify (wait mode)", () => {
  it("hears the notes of a chord, in both hands", () => {
    expect(verify([48, 55, 64, 67, 72], [48, 55, 64, 67, 72])).toEqual([48, 55, 64, 67, 72]);
  });

  it("refuses a semitone neighbour of an expected note", () => {
    expect(verify([60, 65, 67], [60, 64, 67])).toEqual([60, 67]);
  });

  it("refuses the octave above or below, but hears an octave written in the chord", () => {
    expect(verify([72], [60])).toEqual([]);
    expect(verify([48], [60])).toEqual([]);
    expect(verify([48, 60], [48, 60])).toEqual([48, 60]);
  });

  it("hears nothing in silence", () => {
    const silence = new Float64Array(SIZE);
    expect(detector.verify(spectrum.compute(silence), [60])).toEqual([]);
  });
});

describe("PitchDetector.detect", () => {
  it("finds a single note, and never lists a note twice", () => {
    expect(detector.detect(spectrum.compute(tone([57])))[0]?.pitch).toBe(57);
    const pitches = detector.detect(spectrum.compute(tone([48, 60, 72]))).map((note) => note.pitch);
    expect(new Set(pitches).size).toBe(pitches.length);
  });
});

describe("NoteListener", () => {
  it("makes a frame every hop, says which expected notes it hears and when a note starts", () => {
    const listener = new NoteListener({ sampleRate: SAMPLE_RATE });
    listener.expect([60, 64]);
    const samples = Float32Array.from(tone([60, 64], SIZE + 4096));
    const frames = [];
    for (let i = 0; i < samples.length; i += 128) {
      frames.push(...listener.push(samples.subarray(i, i + 128)));
    }

    expect(frames).toHaveLength(5);
    expect(frames[0]?.time).toBeCloseTo(SIZE / SAMPLE_RATE, 5);
    expect(frames.every((frame) => frame.heard.length === 2)).toBe(true);
    expect(frames[0]?.onsets).toEqual(expect.arrayContaining([60, 64]));
    expect(frames[1]?.onsets).toEqual([]);
  });
});
