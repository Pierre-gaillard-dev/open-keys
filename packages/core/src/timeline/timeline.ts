import { type Hand, type HandMapping, handForNote, type NoteHands } from "../hands";
import type { Beat } from "../midi/beat-grid";
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
  /** Metronome grid, sorted by time. */
  readonly beats: readonly Beat[];
}

/**
 * Applies the hands (ignored tracks are dropped) and indexes the notes. The hand of each note comes
 * from `noteHands` when the song has a per-note assignment (D28), else from the mapping.
 */
export function buildTimeline(
  parsed: ParsedNotes,
  mapping: HandMapping,
  noteHands: NoteHands | null = null,
): Timeline {
  const notes: PlayableNote[] = [];
  for (const [index, note] of parsed.notes.entries()) {
    const hand = noteHands ? noteHands[index] : handForNote(mapping, note.trackIndex, note.pitch);
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
    beats: parsed.beats,
  };
}

/** Index of the first beat at or after `time` (binary search). */
export function firstBeatIndexAtOrAfter(beats: readonly Beat[], time: number): number {
  let low = 0;
  let high = beats.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    const beat = beats[middle];
    if (beat !== undefined && beat.time < time) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

export interface CountIn {
  /** Clicks before the music starts: one bar. */
  readonly beats: number;
  /** Length of one beat, in seconds at 100 % speed. */
  readonly beatS: number;
}

const DEFAULT_COUNT_IN: CountIn = { beats: 4, beatS: 0.5 };
/** Tolerance when the position is exactly on a beat (floating point). */
const ON_BEAT_S = 0.001;

/** The count-in before playing from `time`: one bar of the meter and tempo found there. */
export function countInAt(beats: readonly Beat[], time: number): CountIn {
  const index = Math.min(firstBeatIndexAtOrAfter(beats, time - ON_BEAT_S), beats.length - 2);
  const beat = beats[index];
  const next = beats[index + 1];
  if (!(beat && next) || next.time <= beat.time) {
    return DEFAULT_COUNT_IN;
  }
  return { beats: beat.beatsInBar, beatS: next.time - beat.time };
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
