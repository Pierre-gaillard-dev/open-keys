import { type Hand, type HandMapping, handForNote } from "../hands";
import type { ParsedNotes } from "../midi/parse-notes";

export interface PlayableNote {
  readonly pitch: number;
  readonly start: number;
  readonly end: number;
  readonly soundEnd: number;
  readonly velocity: number;
  readonly hand: Hand;
}

/** What the player works with: playable notes sorted by start, plus precomputed bounds. */
export interface Timeline {
  readonly notes: readonly PlayableNote[];
  readonly durationS: number;
  /** Longest key press: how far back to look for notes still visible. */
  readonly maxNoteDuration: number;
  readonly minPitch: number;
  readonly maxPitch: number;
}

/** Applies the hand mapping (ignored tracks are dropped) and indexes the notes. */
export function buildTimeline(parsed: ParsedNotes, mapping: HandMapping): Timeline {
  const notes: PlayableNote[] = [];
  for (const note of parsed.notes) {
    const hand = handForNote(mapping, note.trackIndex, note.pitch);
    if (hand) {
      notes.push({
        pitch: note.pitch,
        start: note.start,
        end: note.end,
        soundEnd: note.soundEnd,
        velocity: note.velocity,
        hand,
      });
    }
  }
  const pitches = notes.map((note) => note.pitch);
  return {
    notes,
    durationS: parsed.durationS,
    maxNoteDuration: notes.reduce((max, note) => Math.max(max, note.end - note.start), 0),
    minPitch: pitches.length > 0 ? Math.min(...pitches) : 60,
    maxPitch: pitches.length > 0 ? Math.max(...pitches) : 60,
  };
}

/** Index of the first note starting at or after `time` (binary search). */
export function firstNoteIndexAtOrAfter(notes: readonly { readonly start: number }[], time: number): number {
  let low = 0;
  let high = notes.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    const note = notes[middle];
    if (note !== undefined && note.start < time) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

/** Notes overlapping [from, to] (a note is visible from its start until its key release). */
export function notesInWindow(timeline: Timeline, from: number, to: number): PlayableNote[] {
  const visible: PlayableNote[] = [];
  const notes = timeline.notes;
  for (let i = firstNoteIndexAtOrAfter(notes, from - timeline.maxNoteDuration); i < notes.length; i++) {
    const note = notes[i];
    if (note === undefined || note.start > to) {
      break;
    }
    if (note.end > from) {
      visible.push(note);
    }
  }
  return visible;
}
