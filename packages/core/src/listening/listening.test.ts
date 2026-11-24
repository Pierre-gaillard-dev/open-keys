import { describe, expect, it } from "vitest";
import { Spectrum } from "./fft";
import { type ListenerOptions, NoteListener } from "./note-listener";
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

  it("refuses the octave above, but hears an octave written in the chord", () => {
    expect(verify([72], [60])).toEqual([]);
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

/** Silence before a strike: a full window, and the frames a strike is compared with. */
const SILENCE = SIZE + 8 * 1024;

/** Frames of a listener expecting `expected` when `played` is struck after silence (window full of it). */
function listenTo(
  played: readonly number[],
  expected: readonly number[],
  options: Partial<ListenerOptions> = {},
  accompaniment: readonly number[] = [],
) {
  const listener = new NoteListener({ sampleRate: SAMPLE_RATE, ...options });
  listener.expect(expected, accompaniment);
  const samples = new Float32Array(SILENCE + SIZE + 4096);
  samples.set(tone(played, SIZE + 4096), SILENCE);
  const frames = [];
  for (let i = 0; i < samples.length; i += 128) {
    frames.push(...listener.push(samples.subarray(i, i + 128)));
  }
  return frames.filter((frame) => frame.time >= (SILENCE + SIZE) / SAMPLE_RATE);
}

describe("NoteListener", () => {
  it("hears nothing in 3 s of a room's background noise (whitening)", () => {
    // Pink-ish noise, louder in the bass, like a room (the benchmark's).
    let seed = 7;
    let low = 0;
    const noise = Float32Array.from({ length: SAMPLE_RATE * 3 }, () => {
      seed = (seed * 16_807) % 2_147_483_647;
      const white = seed / 2_147_483_647 - 0.5;
      low = 0.98 * low + 0.02 * white;
      return (low * 6 + white * 0.4) * 0.01;
    });
    const listener = new NoteListener({ sampleRate: SAMPLE_RATE });
    listener.expect(Array.from({ length: 48 }, (_, i) => 36 + i));
    const heard = [];
    for (let i = 0; i < noise.length; i += 128) {
      heard.push(...listener.push(noise.subarray(i, i + 128)).flatMap((frame) => frame.heard));
    }
    expect(heard).toEqual([]);
  });

  it("refuses the octave below played instead (C3 for C4): free detection finds C3", () => {
    expect(listenTo([48], [60]).every((frame) => frame.heard.length === 0)).toBe(true);
    // The octave below played by the app (accompaniment): the note counts.
    expect(listenTo([48, 60], [60], {}, [48]).some((frame) => frame.heard.includes(60))).toBe(true);
    expect(listenTo([48, 60], [48, 60]).every((frame) => frame.heard.length === 2)).toBe(true);
  });

  it("makes a frame every hop, says which expected notes it hears and when a note starts", () => {
    // Without the room checks: the tone is there from the first sample, never struck.
    const listener = new NoteListener({
      sampleRate: SAMPLE_RATE,
      strike: { strikeHoldS: 0, ambientRatio: 0 },
    });
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

  it("hears a struck chord, but not the same chord sounding steadily from the start (a resonance)", () => {
    expect(listenTo([60, 64, 67], [60, 64, 67]).some((frame) => frame.heard.length === 3)).toBe(true);
    const listener = new NoteListener({ sampleRate: SAMPLE_RATE });
    listener.expect([60, 64, 67]);
    const steady = Float32Array.from(tone([60, 64, 67], SAMPLE_RATE * 2));
    const heard = [];
    for (let i = 0; i < steady.length; i += 128) {
      heard.push(...listener.push(steady.subarray(i, i + 128)).flatMap((frame) => frame.heard));
    }
    expect(heard).toEqual([]);
  });
});
