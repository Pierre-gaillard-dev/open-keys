import type { WaitPoint } from "./wait-points";

/**
 * A chord counts from notes heard at most this long (real seconds) before playback reaches it: the
 * player may strike slightly early, as the notes touch the keyboard.
 */
export const EARLY_S = 0.4;

/**
 * Progress of the wait mode through its points. The caller tells it where playback is (`update`) and
 * which notes are heard (`noteHeard`), both with times on the input's clock; it says which chord is
 * awaited and when it is played. Pure: no timer, no audio.
 */
export class WaitTracker {
  readonly #points: readonly WaitPoint[];
  #index = 0;
  /** When the current point started counting notes (null: still too far ahead). */
  #armedAt: number | null = null;
  readonly #heardAt = new Map<number, number>();

  constructor(points: readonly WaitPoint[]) {
    this.#points = points;
  }

  /** The chord awaited next, or null at the end. */
  get current(): WaitPoint | null {
    return this.#points[this.#index] ?? null;
  }

  /** Playback is at song time `position`, going at `rate`, at time `now`. */
  update(position: number, rate: number, now: number): void {
    const point = this.current;
    if (point && this.#armedAt === null && (point.time - position) / rate <= EARLY_S) {
      this.#armedAt = now;
    }
  }

  noteHeard(pitch: number, now: number): void {
    this.#heardAt.set(pitch, now);
  }

  /** The notes of the current chord not heard since it started counting. */
  missing(): number[] {
    const point = this.current;
    if (!point) {
      return [];
    }
    const armedAt = this.#armedAt;
    return point.pitches.filter(
      (pitch) => armedAt === null || (this.#heardAt.get(pitch) ?? Number.NEGATIVE_INFINITY) < armedAt,
    );
  }

  /** True when the current chord counts and all its notes were heard. */
  get satisfied(): boolean {
    return this.current !== null && this.#armedAt !== null && this.missing().length === 0;
  }

  /** The current chord was played: on to the next one. */
  advance(): void {
    this.#index++;
    this.#armedAt = null;
  }

  /** After a seek or a loop: the next chord is the first at or after `position`. */
  seek(position: number): void {
    const found = this.#points.findIndex((point) => point.time >= position - 1e-6);
    this.#index = found === -1 ? this.#points.length : found;
    this.#armedAt = null;
  }
}
