import type { WaitPoint } from "./wait-points";
import { EARLY_S } from "./wait-tracker";

/**
 * A chord still counts this long (real seconds) after playback passed it: the player's timing, plus
 * the microphone's delay (about 0.1 s between the strike and its detection).
 */
export const LATE_S = 0.35;

export type Verdict = "hit" | "miss";

export interface Judgement {
  readonly point: WaitPoint;
  readonly verdict: Verdict;
}

interface Open {
  readonly point: WaitPoint;
  readonly heard: Set<number>;
}

/**
 * Rhythm mode (V1.5): playback goes on, and each chord of the hands practised is judged as it passes.
 * A chord is hit when all its notes are heard between EARLY_S before and LATE_S after playback reaches
 * it, missed otherwise. Several chords can be open at once (fast passages). Pure: the caller tells it
 * where playback is and what is heard, with times on the input's clock.
 */
export class RhythmTracker {
  readonly #points: readonly WaitPoint[];
  /** Next point not opened yet. */
  #next = 0;
  /** Points open for notes, oldest first, with when playback reaches each (input clock). */
  #open: (Open & { reachedAt: number })[] = [];

  constructor(points: readonly WaitPoint[]) {
    this.#points = points;
  }

  /**
   * Playback is at song time `position`, going at `rate`, at time `now`: opens the chords coming within
   * EARLY_S, closes as missed those passed more than LATE_S ago. Returns the chords judged missed.
   */
  update(position: number, rate: number, now: number): Judgement[] {
    let point = this.#points[this.#next];
    while (point && (point.time - position) / rate <= EARLY_S) {
      this.#open.push({ point, heard: new Set(), reachedAt: now + (point.time - position) / rate });
      this.#next++;
      point = this.#points[this.#next];
    }
    // Not reached yet: when it will be follows the speed (it may change meanwhile).
    for (const open of this.#open) {
      if (open.point.time > position) {
        open.reachedAt = now + (open.point.time - position) / rate;
      }
    }
    const missed = this.#open.filter((open) => now - open.reachedAt > LATE_S);
    this.#open = this.#open.filter((open) => now - open.reachedAt <= LATE_S);
    return missed.map((open) => ({ point: open.point, verdict: "miss" }));
  }

  /** A note heard: it goes to the oldest open chord that needs it. Returns that chord if now hit. */
  noteHeard(pitch: number): Judgement | null {
    const open = this.#open.find(
      (candidate) => candidate.point.pitches.includes(pitch) && !candidate.heard.has(pitch),
    );
    if (!open) {
      return null;
    }
    open.heard.add(pitch);
    if (open.heard.size < open.point.pitches.length) {
      return null;
    }
    this.#open = this.#open.filter((candidate) => candidate !== open);
    return { point: open.point, verdict: "hit" };
  }

  /** The notes awaited by the open chords. */
  listening(): number[] {
    return [...new Set(this.#open.flatMap((open) => open.point.pitches))].sort((a, b) => a - b);
  }

  /** After a seek or a loop: nothing open, the next chord is the first at or after `position`. */
  seek(position: number): void {
    const found = this.#points.findIndex((point) => point.time >= position - 1e-6);
    this.#next = found === -1 ? this.#points.length : found;
    this.#open = [];
  }
}
