import type { NoteHandsInput, SongDetail } from "@open-keys/contracts";
import {
  decodeNoteHands,
  encodeNoteHands,
  HAND_SEPARATION_VERSION,
  type Hand,
  type HandMapping,
  type HandMode,
  type NoteHands,
  type ParsedNote,
  separateNoteHands,
  type TrackHand,
} from "@open-keys/core";

/** How the hands are given (D28): note by note (algorithm, then corrections), by track, or by pitch. */
export type HandsChoice = "auto" | HandMode;

/**
 * Per-note assignment being edited:
 * - `auto`: computed from the played tracks, follows their changes;
 * - `stored`: the one saved with the song, untouched (sent back unchanged);
 * - `edited`: modified here (corrections, or played tracks changed).
 */
export type Assignment =
  | { readonly kind: "auto" }
  | { readonly kind: "stored" }
  | {
      readonly kind: "edited";
      readonly hands: NoteHands;
      readonly source: NoteHandsInput["source"];
      readonly version: number;
    };

export function initialHandsChoice(song: SongDetail): HandsChoice {
  if (song.noteHands) {
    return "auto";
  }
  // A new import starts with the algorithm; an older song keeps its mode until asked.
  return song.state === "draft" ? "auto" : song.handMode;
}

export function initialAssignment(song: SongDetail): Assignment {
  return song.noteHands ? { kind: "stored" } : { kind: "auto" };
}

export function mappingOf(
  tracks: SongDetail["tracks"],
  trackHands: Readonly<Record<string, TrackHand>>,
  mode: HandMode,
  splitPitch: number,
): HandMapping {
  return {
    mode,
    splitPitch,
    tracks: tracks.map((track) => ({
      trackIndex: track.trackIndex,
      hand: trackHands[track.id] ?? track.hand,
    })),
  };
}

/** The hand of every note as it will be saved. */
export function effectiveHands(
  assignment: Assignment,
  song: SongDetail,
  notes: readonly ParsedNote[],
  mapping: HandMapping,
): NoteHands {
  if (assignment.kind === "edited") {
    return assignment.hands;
  }
  const stored =
    assignment.kind === "stored" && song.noteHands ? decodeNoteHands(notes, song.noteHands) : null;
  return stored ?? separateNoteHands(notes, mapping);
}

/**
 * A track switched between played and ignored: its notes leave the assignment, or get the hands the
 * algorithm gives them now. The other notes keep theirs (corrections included).
 */
export function withPlayedTracks(
  assignment: Assignment,
  current: NoteHands,
  notes: readonly ParsedNote[],
  mapping: HandMapping,
  song: SongDetail,
): Assignment {
  if (assignment.kind === "auto") {
    return assignment;
  }
  const played = new Set(mapping.tracks.filter((t) => t.hand !== "ignore").map((t) => t.trackIndex));
  const separated = separateNoteHands(notes, mapping);
  const hands = notes.map((note, index) => {
    if (!played.has(note.trackIndex)) {
      return undefined;
    }
    return current[index] ?? separated[index];
  });
  const base = assignment.kind === "edited" ? assignment : song.noteHands;
  return {
    kind: "edited",
    hands,
    source: base?.source ?? "auto",
    version: base?.version ?? HAND_SEPARATION_VERSION,
  };
}

/** Corrections: the selected notes go to `hand` (notes of ignored tracks stay out). */
export function withHand(current: NoteHands, indexes: Iterable<number>, hand: Hand): Assignment {
  const hands = [...current];
  for (const index of indexes) {
    if (hands[index] !== undefined) {
      hands[index] = hand;
    }
  }
  return { kind: "edited", hands, source: "edited", version: HAND_SEPARATION_VERSION };
}

/** What to send: nothing when the stored assignment is untouched, null outside the per-note mode. */
export function noteHandsRequest(
  choice: HandsChoice,
  assignment: Assignment,
  hands: NoteHands | null,
  notes: readonly ParsedNote[] | undefined,
): NoteHandsInput | null | undefined {
  if (choice !== "auto") {
    return null;
  }
  if (assignment.kind === "stored" || !(hands && notes)) {
    return undefined;
  }
  const encoded = encodeNoteHands(notes, hands);
  return assignment.kind === "edited"
    ? { ...encoded, source: assignment.source, version: assignment.version }
    : { ...encoded, source: "auto", version: HAND_SEPARATION_VERSION };
}
