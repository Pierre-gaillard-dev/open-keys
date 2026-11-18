import type { ParsedNote } from "../midi/parse-notes";
import type { Hand, HandMapping } from "./hands.types";
import { DEFAULT_SEPARATION_WEIGHTS, separateHands } from "./separate-hands";

/** Raised when the algorithm changes: stored assignments keep the version that computed them. */
export const HAND_SEPARATION_VERSION = 1;

/**
 * Hand of every note of a song, as stored with it (computed once, then possibly edited by hand).
 * `hands` has one character per note, in the canonical order of the notes (track, ticks, pitch):
 * `l` left, `r` right, `-` not played (ignored track). `fingerprint` identifies that list of notes, so a
 * list that does not match the file is never applied.
 */
export interface EncodedNoteHands {
  readonly hands: string;
  readonly fingerprint: string;
}

/** A hand per parsed note (same order as `ParsedNotes.notes`), undefined when not played. */
export type NoteHands = readonly (Hand | undefined)[];

type NoteIdentity = Pick<ParsedNote, "trackIndex" | "ticks" | "pitch">;

/** Indexes of the notes in canonical order: independent of the order a parser returns them in. */
function canonicalOrder(notes: readonly NoteIdentity[]): number[] {
  return notes
    .map((_, index) => index)
    .sort((a, b) => {
      const x = notes[a] as NoteIdentity;
      const y = notes[b] as NoteIdentity;
      return x.trackIndex - y.trackIndex || x.ticks - y.ticks || x.pitch - y.pitch;
    });
}

/** FNV-1a (32 bits) of the canonical list of notes, as 8 hex digits. */
export function notesFingerprint(notes: readonly NoteIdentity[]): string {
  let hash = 0x811c9dc5;
  const mix = (value: number) => {
    for (let shift = 0; shift < 32; shift += 8) {
      hash ^= (value >>> shift) & 0xff;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  };
  mix(notes.length);
  for (const index of canonicalOrder(notes)) {
    const note = notes[index] as NoteIdentity;
    mix(note.trackIndex);
    mix(Math.round(note.ticks));
    mix(note.pitch);
  }
  return hash.toString(16).padStart(8, "0");
}

const CODES: Readonly<Record<string, Hand>> = { l: "left", r: "right" };

export function encodeNoteHands(notes: readonly NoteIdentity[], hands: NoteHands): EncodedNoteHands {
  const codes = canonicalOrder(notes).map((index) => {
    const hand = hands[index];
    return hand === undefined ? "-" : hand[0];
  });
  return { hands: codes.join(""), fingerprint: notesFingerprint(notes) };
}

/** The stored hands, in the order of `notes`; null when they do not match these notes. */
export function decodeNoteHands(notes: readonly NoteIdentity[], encoded: EncodedNoteHands): NoteHands | null {
  if (encoded.hands.length !== notes.length || encoded.fingerprint !== notesFingerprint(notes)) {
    return null;
  }
  const hands: (Hand | undefined)[] = notes.map(() => undefined);
  canonicalOrder(notes).forEach((index, position) => {
    hands[index] = CODES[encoded.hands[position] ?? "-"];
  });
  return hands;
}

/**
 * Automatic assignment (D28): the notes of the tracks not ignored by `mapping` are split between the
 * hands by `separateHands`, whatever hand their track was given.
 */
export function separateNoteHands(notes: readonly ParsedNote[], mapping: HandMapping): NoteHands {
  const played = new Set(
    mapping.tracks.filter((track) => track.hand !== "ignore").map((track) => track.trackIndex),
  );
  const indexes = notes.flatMap((note, index) => (played.has(note.trackIndex) ? [index] : []));
  const separated = separateHands(
    indexes.map((index) => notes[index] as ParsedNote),
    DEFAULT_SEPARATION_WEIGHTS,
  );
  const hands: (Hand | undefined)[] = notes.map(() => undefined);
  indexes.forEach((index, position) => {
    hands[index] = separated[position];
  });
  return hands;
}
