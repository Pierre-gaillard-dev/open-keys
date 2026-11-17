import { type SongDetail, songEditableFieldsSchema, type ValidationIssue } from "@open-keys/contracts";
import type { HandMode, TrackHand } from "@open-keys/core";
import type { z } from "zod";

export type DifficultyChoice = "none" | "1" | "2" | "3" | "4" | "5";

/** Editable state of the song editor (inputs keep strings, converted on submit). */
export interface SongFormValues {
  readonly title: string;
  readonly composer: string;
  readonly difficulty: DifficultyChoice;
  readonly license: string;
  readonly tags: readonly string[];
  readonly handMode: HandMode;
  readonly splitPitch: number;
  readonly trackHands: Readonly<Record<string, TrackHand>>;
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
    handMode: song.handMode,
    splitPitch: song.splitPitch,
    trackHands: Object.fromEntries(song.tracks.map((track) => [track.id, track.hand])),
  };
}

const emptyToNull = (value: string): string | null => (value.trim() === "" ? null : value.trim());

/** Form values → request fields, validated with the same contract as the server. */
export function toEditableFields(values: SongFormValues): SongFormResult {
  const parsed = songEditableFieldsSchema.safeParse({
    title: values.title,
    composer: emptyToNull(values.composer),
    difficulty: values.difficulty === "none" ? null : Number(values.difficulty),
    license: emptyToNull(values.license),
    tags: values.tags,
    handMode: values.handMode,
    splitPitch: values.splitPitch,
    tracks: Object.entries(values.trackHands).map(([id, hand]) => ({ id, hand })),
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
