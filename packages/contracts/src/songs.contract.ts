import { z } from "zod";
import {
  csvSchema,
  difficultySchema,
  pianoPitchSchema,
  timestampSchema,
  ulidSchema,
} from "./common.contract";
import { coverSchema } from "./covers.contract";
import { songStatusSchema } from "./library.contract";

export const trackHandSchema = z.enum(["left", "right", "ignore"]);
export const handModeSchema = z.enum(["tracks", "split"]);
export const songStateSchema = z.enum(["draft", "ready"]);
export const songSourceTypeSchema = z.enum(["upload", "url", "mutopia"]);

export const songTrackSchema = z.object({
  id: ulidSchema,
  trackIndex: z.number().int().nonnegative(),
  channel: z.number().int().min(0).max(15),
  name: z.string().nullable(),
  instrument: z.string().nullable(),
  noteCount: z.number().int().nonnegative(),
  minPitch: z.number().int(),
  maxPitch: z.number().int(),
  hand: trackHandSchema,
});

export type SongTrack = z.infer<typeof songTrackSchema>;

export const songLibrarySummarySchema = z.object({
  status: songStatusSchema,
  isFavorite: z.boolean(),
  lastPracticedAt: timestampSchema.nullable(),
});

export const songSummarySchema = z.object({
  id: ulidSchema,
  title: z.string(),
  composer: z.string().nullable(),
  difficulty: difficultySchema.nullable(),
  durationMs: z.number().int().nonnegative(),
  noteCount: z.number().int().nonnegative(),
  minPitch: z.number().int(),
  maxPitch: z.number().int(),
  tags: z.array(z.string()),
  cover: coverSchema.nullable(),
  /** Personal state of the current user, null if never touched. */
  library: songLibrarySummarySchema.nullable(),
  createdAt: timestampSchema,
});

export type SongSummary = z.infer<typeof songSummarySchema>;

export const songDetailSchema = songSummarySchema.extend({
  state: songStateSchema,
  sourceType: songSourceTypeSchema,
  sourceUrl: z.string().nullable(),
  license: z.string().nullable(),
  handMode: handModeSchema,
  splitPitch: pianoPitchSchema,
  tracks: z.array(songTrackSchema),
  /** API path of the MIDI file. */
  midiUrl: z.string(),
  updatedAt: timestampSchema,
});

export type SongDetail = z.infer<typeof songDetailSchema>;

export const SONG_SORTS = ["title", "created", "practiced"] as const;

export const listSongsQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  tags: csvSchema.optional(),
  status: songStatusSchema.optional(),
  favorite: z.enum(["true", "false"]).optional(),
  difficulty: csvSchema
    .transform((items) => items.map(Number))
    .pipe(z.array(difficultySchema))
    .optional(),
  sort: z.enum(SONG_SORTS).default("created"),
});

export type ListSongsQuery = z.infer<typeof listSongsQuerySchema>;

const trackHandsSchema = z.array(z.object({ id: ulidSchema, hand: trackHandSchema })).max(64);

/** Editable fields of a song (import review and later edits). */
export const songEditableFieldsSchema = z.object({
  title: z.string().trim().min(1).max(200),
  composer: z.string().trim().max(200).nullable(),
  difficulty: difficultySchema.nullable(),
  license: z.string().trim().max(100).nullable(),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(20),
  handMode: handModeSchema,
  splitPitch: pianoPitchSchema,
  tracks: trackHandsSchema,
});

export const updateSongRequestSchema = songEditableFieldsSchema.partial();

export type UpdateSongRequest = z.infer<typeof updateSongRequestSchema>;

export const songIdParamSchema = z.object({ id: ulidSchema });
