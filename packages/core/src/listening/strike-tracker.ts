import { HIGHEST_PITCH, LOWEST_PITCH } from "./pitch-detector";

export interface StrikeOptions {
  /** A note counts only this many times above its ambient level in the room. 0: no ambient check. */
  readonly ambientRatio?: number;
  /** A strike: the salience of a note jumps this many times above its lowest of the last frames. */
  readonly strikeRatio?: number;
  /** Frames looked back for a strike (21 ms each: about 125 ms). */
  readonly strikeFrames?: number;
  /** A note counts this long after its strike (seconds). 0: no strike needed. */
  readonly strikeHoldS?: number;
}

const KEYS = HIGHEST_PITCH - LOWEST_PITCH + 1;
/** The ambient level falls at once to a quieter frame, and rises slowly (about 5 s at 47 frames/s). */
const AMBIENT_FALL = 0.5;
const AMBIENT_RISE = 0.004;

/**
 * Per key, over time: the ambient level of the room (what the key weighs when nothing is played:
 * fridge, television, a string that keeps resonating) and the last strike (a sudden jump). A piano
 * note is struck: a steady sound never is, however loud, so it lights nothing.
 */
export class StrikeTracker {
  readonly #ambientRatio: number;
  readonly #strikeRatio: number;
  readonly #strikeHoldS: number;
  readonly #ambient = new Float64Array(KEYS);
  readonly #lastStrike = new Float64Array(KEYS).fill(Number.NEGATIVE_INFINITY);
  /** Saliences of the last frames, newest last. */
  readonly #history: Float64Array[];
  #frames = 0;

  constructor(options: StrikeOptions = {}) {
    this.#ambientRatio = options.ambientRatio ?? 3;
    this.#strikeRatio = options.strikeRatio ?? 2;
    this.#strikeHoldS = options.strikeHoldS ?? 0.5;
    this.#history = Array.from({ length: options.strikeFrames ?? 6 }, () => new Float64Array(KEYS));
  }

  /** The saliences of the frame ending at `time` (seconds). */
  update(time: number, saliences: Float64Array): void {
    for (let key = 0; key < KEYS; key++) {
      const salience = saliences[key] ?? 0;
      let lowest = Number.POSITIVE_INFINITY;
      for (const past of this.#history) {
        lowest = Math.min(lowest, past[key] ?? 0);
      }
      const full = this.#frames >= this.#history.length;
      if (full && salience >= lowest * this.#strikeRatio && this.#aboveAmbient(key, salience)) {
        this.#lastStrike[key] = time;
      }
      const ambient = this.#ambient[key] ?? 0;
      this.#ambient[key] =
        this.#frames === 0 || salience < ambient
          ? ambient + (salience - ambient) * (this.#frames === 0 ? 1 : AMBIENT_FALL)
          : ambient + (salience - ambient) * AMBIENT_RISE;
    }
    // Oldest history frame becomes the newest.
    const oldest = this.#history.shift() as Float64Array;
    oldest.set(saliences);
    this.#history.push(oldest);
    this.#frames++;
  }

  #aboveAmbient(key: number, salience: number): boolean {
    return this.#ambientRatio <= 0 || salience > (this.#ambient[key] ?? 0) * this.#ambientRatio;
  }

  /** True when `pitch` stands above the room and was struck recently, at frame `time`. */
  counts(pitch: number, time: number, salience: number): boolean {
    const key = pitch - LOWEST_PITCH;
    const struck =
      this.#strikeHoldS <= 0 ||
      time - (this.#lastStrike[key] ?? Number.NEGATIVE_INFINITY) <= this.#strikeHoldS;
    return struck && this.#aboveAmbient(key, salience);
  }
}
