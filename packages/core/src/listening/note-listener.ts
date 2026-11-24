import { Spectrum } from "./fft";
import {
  type DetectedNote,
  type DetectorOptions,
  HIGHEST_PITCH,
  LOWEST_PITCH,
  PitchDetector,
  type VerifyOptions,
} from "./pitch-detector";
import { type StrikeOptions, StrikeTracker } from "./strike-tracker";

export interface ListenerOptions extends DetectorOptions {
  /** A frame every this many samples: 1024 at 48 kHz = 21 ms. */
  readonly hopSize?: number;
  /** A note already sounding is struck again when it gets this much louder. */
  readonly restrikeRatio?: number;
  readonly verify?: VerifyOptions;
  /**
   * An expected note is refused when the free detection finds its octave below instead (not expected):
   * C3 played for C4. Free detection prefers the lowest note that explains the spectrum.
   */
  readonly octaveCrossCheck?: boolean;
  /**
   * An expected note counts only when it stands above its ambient level in the room and was struck
   * recently: a steady sound (fridge, television, resonance) lights nothing.
   */
  readonly strike?: StrikeOptions;
}

export interface ListenFrame {
  /** End of the analysed window, in seconds since the first sample. */
  readonly time: number;
  readonly notes: readonly DetectedNote[];
  /** Notes struck in this frame: new, or clearly louder again (a repeated key). */
  readonly onsets: readonly number[];
  /** The expected notes (see `expect`) that sound in this frame. */
  readonly heard: readonly number[];
}

/**
 * Microphone stream → frames of notes (V1.5). Samples come in chunks of any size (audio worklet:
 * 128); a frame is analysed every `hopSize` samples over the last `fftSize` ones.
 */
export class NoteListener {
  readonly #detector: PitchDetector;
  readonly #spectrum: Spectrum;
  readonly #buffer: Float32Array;
  readonly #hopSize: number;
  readonly #restrikeRatio: number;
  readonly #sampleRate: number;
  /** Samples received in total, and since the last frame. */
  #received = 0;
  #sinceFrame = 0;
  #previous = new Map<number, number>();
  #expected: readonly number[] = [];
  readonly #verifyOptions: VerifyOptions;
  readonly #octaveCrossCheck: boolean;
  readonly #strikes: StrikeTracker;
  readonly #saliences = new Float64Array(HIGHEST_PITCH - LOWEST_PITCH + 1);

  constructor(options: ListenerOptions) {
    this.#detector = new PitchDetector(options);
    this.#spectrum = new Spectrum(this.#detector.fftSize);
    this.#buffer = new Float32Array(this.#detector.fftSize);
    this.#hopSize = options.hopSize ?? 1024;
    this.#restrikeRatio = options.restrikeRatio ?? 1.8;
    this.#sampleRate = options.sampleRate;
    this.#verifyOptions = options.verify ?? {};
    this.#octaveCrossCheck = options.octaveCrossCheck ?? true;
    this.#strikes = new StrikeTracker(options.strike);
  }

  /** Notes the player should be playing now (wait mode): each frame says which ones it hears. */
  expect(pitches: readonly number[]): void {
    this.#expected = [...pitches];
  }

  push(samples: Float32Array): ListenFrame[] {
    const frames: ListenFrame[] = [];
    const size = this.#buffer.length;
    for (const sample of samples) {
      // Shift-free ring: the window is rebuilt in order at each frame.
      this.#buffer[this.#received % size] = sample;
      this.#received++;
      this.#sinceFrame++;
      if (this.#sinceFrame >= this.#hopSize && this.#received >= size) {
        this.#sinceFrame = 0;
        frames.push(this.#frame());
      }
    }
    return frames;
  }

  #withoutOctaveBelow(verified: readonly number[], notes: readonly DetectedNote[]): number[] {
    return verified.filter((pitch) => {
      const lower = pitch - 12;
      return this.#expected.includes(lower) || !notes.some((note) => note.pitch === lower);
    });
  }

  #frame(): ListenFrame {
    const size = this.#buffer.length;
    const start = this.#received % size;
    const ordered = new Float32Array(size);
    ordered.set(this.#buffer.subarray(start));
    ordered.set(this.#buffer.subarray(0, start), size - start);
    const magnitudes = this.#spectrum.compute(ordered);
    const time = this.#received / this.#sampleRate;
    const saliences = this.#detector.saliences(magnitudes, this.#saliences);
    this.#strikes.update(time, saliences);
    const notes = this.#detector.detect(magnitudes);
    const verified =
      this.#expected.length > 0 ? this.#detector.verify(magnitudes, this.#expected, this.#verifyOptions) : [];
    const struck = verified.filter((pitch) =>
      this.#strikes.counts(pitch, time, saliences[pitch - LOWEST_PITCH] ?? 0),
    );
    const heard = this.#octaveCrossCheck ? this.#withoutOctaveBelow(struck, notes) : struck;
    const onsets = notes
      .filter((note) => {
        const before = this.#previous.get(note.pitch);
        return before === undefined || note.strength > before * this.#restrikeRatio;
      })
      .map((note) => note.pitch);
    this.#previous = new Map(notes.map((note) => [note.pitch, note.strength]));
    return { time, notes, onsets, heard };
  }
}
