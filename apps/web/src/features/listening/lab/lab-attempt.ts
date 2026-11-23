/** A note counts once heard in this many frames in a row. */
export const REQUIRED_FRAMES = 2;
/**
 * A chord counts when all its notes are confirmed within this window: one strike, not several strikes
 * adding up (the wait mode judges each strike). A note confirmed earlier is forgotten after it.
 */
export const CHORD_WINDOW_S = 0.3;

/** One try at the notes asked for in the lab. Times are on the audio clock (seconds). */
export interface Attempt {
  /** Frames in a row each expected note has been heard in. */
  readonly streaks: Map<number, number>;
  /** When each expected note was last confirmed: a new confirmation after a gap is a new strike. */
  readonly heardAt: Map<number, number>;
  /** Spread between the first and the last note of the chord, once recognised from one strike. */
  spreadS: number | null;
}

export const newAttempt = (): Attempt => ({ streaks: new Map(), heardAt: new Map(), spreadS: null });

/** Records a frame at audio time `time` where `heard` (among `expected`) sound. */
export function recordFrame(
  attempt: Attempt,
  time: number,
  heard: readonly number[],
  expected: readonly number[],
): void {
  for (const pitch of expected) {
    const streak = heard.includes(pitch) ? (attempt.streaks.get(pitch) ?? 0) + 1 : 0;
    attempt.streaks.set(pitch, streak);
    if (streak === REQUIRED_FRAMES) {
      attempt.heardAt.set(pitch, time);
    }
  }
  if (attempt.spreadS !== null) {
    return;
  }
  const times = expected.map((pitch) => attempt.heardAt.get(pitch));
  if (times.every((at) => at !== undefined && time - at <= CHORD_WINDOW_S)) {
    const confirmed = times as number[];
    attempt.spreadS = Math.max(...confirmed) - Math.min(...confirmed);
  }
}

/** Expected notes confirmed within the last `windowS` before `now`. */
export function recentNotes(attempt: Attempt, now: number, windowS: number): Set<number> {
  const recent = new Set<number>();
  for (const [pitch, at] of attempt.heardAt) {
    if (now - at <= windowS) {
      recent.add(pitch);
    }
  }
  return recent;
}
