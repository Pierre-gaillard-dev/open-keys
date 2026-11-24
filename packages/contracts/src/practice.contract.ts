import { z } from "zod";
import { tempoPctSchema, timestampSchema, ulidSchema } from "./common.contract";

const loopFieldsSchema = z.object({
  songId: ulidSchema,
  name: z.string().trim().max(80).nullable(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
  targetTempoPct: tempoPctSchema.nullable(),
  bestTempoPct: tempoPctSchema.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  deletedAt: timestampSchema.nullable(),
});

const endAfterStart = (loop: { startMs: number; endMs: number }) => loop.endMs > loop.startMs;

export const loopSchema = loopFieldsSchema
  .extend({ id: ulidSchema })
  .refine(endAfterStart, { message: "endMs must be greater than startMs", path: ["endMs"] });

export type Loop = z.infer<typeof loopSchema>;

/** Upsert of a loop created on the client (offline-capable, last-write-wins). */
export const putLoopRequestSchema = loopFieldsSchema.refine(endAfterStart, {
  message: "endMs must be greater than startMs",
  path: ["endMs"],
});

export type PutLoopRequest = z.infer<typeof putLoopRequestSchema>;

/**
 * How the song was practised: watched and listened to, played on the piano with the wait mode, or
 * played on the piano in rhythm (V1.5, the microphone hears it).
 */
export const PRACTICE_MODES = ["watch", "wait", "rhythm"] as const;
export const practiceModeSchema = z.enum(PRACTICE_MODES);
export type PracticeMode = z.infer<typeof practiceModeSchema>;

const practiceSessionFieldsSchema = z.object({
  songId: ulidSchema,
  loopId: ulidSchema.nullable(),
  mode: practiceModeSchema,
  startedAt: timestampSchema,
  endedAt: timestampSchema,
  activeMs: z.number().int().min(10_000),
  minTempoPct: tempoPctSchema,
  maxTempoPct: tempoPctSchema,
  /** Played on the piano: share of chords right (rhythm) or played without making playback wait. */
  accuracy: z.number().min(0).max(1).nullable(),
  /** Played on the piano: chords played. */
  score: z.number().int().nonnegative().nullable(),
  updatedAt: timestampSchema,
});

export const practiceSessionSchema = practiceSessionFieldsSchema.extend({ id: ulidSchema });

export type PracticeSession = z.infer<typeof practiceSessionSchema>;

export const putPracticeSessionRequestSchema = practiceSessionFieldsSchema;

export type PutPracticeSessionRequest = z.infer<typeof putPracticeSessionRequestSchema>;

export const practiceStatsSchema = z.object({
  songId: ulidSchema,
  totalActiveMs: z.number().int().nonnegative(),
  sessionCount: z.number().int().nonnegative(),
  lastPracticedAt: timestampSchema.nullable(),
});

export type PracticeStats = z.infer<typeof practiceStatsSchema>;

/** Longest history the API returns at once (UC-27). */
export const MAX_HISTORY_DAYS = 400;

export const listPracticeSessionsQuerySchema = z
  .object({
    /** Sessions started at or after this time. */
    from: z.coerce.number().int().nonnegative(),
    /** Sessions started before this time (now by default). */
    to: z.coerce.number().int().positive().optional(),
  })
  .refine((query) => query.to === undefined || query.to > query.from, {
    message: "to must be after from",
    path: ["to"],
  });

export type ListPracticeSessionsQuery = z.infer<typeof listPracticeSessionsQuerySchema>;

/** A session of the history, with the song it was about. */
export const practiceHistoryEntrySchema = practiceSessionSchema.extend({
  songTitle: z.string(),
  songComposer: z.string().nullable(),
});

export type PracticeHistoryEntry = z.infer<typeof practiceHistoryEntrySchema>;

export const practiceHistorySchema = z.object({
  /** Most recent first. */
  sessions: z.array(practiceHistoryEntrySchema),
});

export type PracticeHistory = z.infer<typeof practiceHistorySchema>;
