import type { Hand } from "../hands";
import type { PlayableNote } from "../timeline";

/** Notes starting this close together are one chord: hands are never perfectly together in a MIDI. */
export const CHORD_TOLERANCE_S = 0.04;

/** Where the wait mode stops: a chord of the hands practised, at song time `time`. */
export interface WaitPoint {
  readonly time: number;
  readonly pitches: readonly number[];
  /** Indexes of its notes in the timeline (to mark them played or missed). */
  readonly noteIndexes: readonly number[];
}

/**
 * The chords the player must play in wait mode: the notes of the `hands` practised, grouped when they
 * start within CHORD_TOLERANCE_S of the first note of the group. `notes` are sorted by start.
 */
export function waitPoints(notes: readonly PlayableNote[], hands: readonly Hand[]): WaitPoint[] {
  const points: { time: number; pitches: Set<number>; noteIndexes: number[] }[] = [];
  for (const [index, note] of notes.entries()) {
    if (!hands.includes(note.hand)) {
      continue;
    }
    const last = points.at(-1);
    if (last && note.start - last.time <= CHORD_TOLERANCE_S) {
      last.pitches.add(note.pitch);
      last.noteIndexes.push(index);
    } else {
      points.push({ time: note.start, pitches: new Set([note.pitch]), noteIndexes: [index] });
    }
  }
  return points.map((point) => ({
    time: point.time,
    pitches: [...point.pitches].sort((a, b) => a - b),
    noteIndexes: point.noteIndexes,
  }));
}
