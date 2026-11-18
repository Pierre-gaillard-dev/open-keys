import {
  type NoteHandsInput,
  type SongDetail,
  songEditableFieldsSchema,
  type ValidationIssue,
} from "@open-keys/contracts";
import type { TrackHand } from "@open-keys/core";
import type { z } from "zod";
import { type Assignment, type HandsChoice, initialAssignment, initialHandsChoice } from "./hands-assignment";

export type DifficultyChoice = "none" | "1" | "2" | "3" | "4" | "5";

/** Editable state of the song editor (inputs keep strings, converted on submit). */
export interface SongFormValues {
  readonly title: string;
  readonly composer: string;
  readonly difficulty: DifficultyChoice;
  readonly license: string;
  readonly tags: readonly string[];
  readonly handsChoice: HandsChoice;
  readonly splitPitch: number;
  readonly trackHands: Readonly<Record<string, TrackHand>>;
  /** Hand of every note, in the per-note mode (D28). */
  readonly assignment: Assignment;
}

export type SongEditableFields = z.infer<typeof songEditableFieldsSchema>;

export type SongFormResult =
  | { readonly success: true; readonly fields: SongEditableFields }
  | { readonly success: false; readonly issues: readonly ValidationIssue[] };

function toDifficultyChoice(difficulty: number | null): DifficultyChoice {
  switch (difficulty) {
    case 1:
      return "1";
    case 2:
      return "2";
    case 3:
      return "3";
    case 4:
      return "4";
    case 5:
      return "5";
    default:
      return "none";
  }
}

export function toFormValues(song: SongDetail): SongFormValues {
  return {
    title: song.title,
    composer: song.composer ?? "",
    difficulty: toDifficultyChoice(song.difficulty),
    license: song.license ?? "",
    tags: song.tags,
    handsChoice: initialHandsChoice(song),
    splitPitch: song.splitPitch,
    trackHands: Object.fromEntries(song.tracks.map((track) => [track.id, track.hand])),
    assignment: initialAssignment(song),
  };
}

const emptyToNull = (value: string): string | null => (value.trim() === "" ? null : value.trim());

/**
 * Form values → request fields, validated with the same contract as the server. `noteHands` is the
 * encoded per-note assignment (undefined: unchanged). In the per-note mode, the mode stored for the
 * tracks is the split by pitch: the fallback if the assignment ever stops matching the file.
 */
export function toEditableFields(values: SongFormValues, noteHands?: NoteHandsInput | null): SongFormResult {
  const parsed = songEditableFieldsSchema.safeParse({
    title: values.title,
    composer: emptyToNull(values.composer),
    difficulty: values.difficulty === "none" ? null : Number(values.difficulty),
    license: emptyToNull(values.license),
    tags: values.tags,
    handMode: values.handsChoice === "auto" ? "split" : values.handsChoice,
    splitPitch: values.splitPitch,
    tracks: Object.entries(values.trackHands).map(([id, hand]) => ({ id, hand })),
    ...(noteHands === undefined ? {} : { noteHands }),
  });
  if (parsed.success) {
    return { success: true, fields: parsed.data };
  }
  return {
    success: false,
    issues: parsed.error.issues.map((issue) => ({
      path: issue.path.map(String).join("."),
      message: issue.message,
    })),
  };
}

/** Adds a tag typed by the user (trimmed, lower case, no duplicates). */
export function addTag(tags: readonly string[], raw: string): readonly string[] {
  const tag = raw.trim().toLowerCase().replace(/^#/, "");
  return tag && !tags.includes(tag) ? [...tags, tag] : tags;
}
