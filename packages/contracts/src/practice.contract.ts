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

export const practiceModeSchema = z.enum(["watch", "midi"]);

const practiceSessionFieldsSchema = z.object({
  songId: ulidSchema,
  loopId: ulidSchema.nullable(),
  mode: practiceModeSchema,
  startedAt: timestampSchema,
  endedAt: timestampSchema,
  activeMs: z.number().int().min(10_000),
  minTempoPct: tempoPctSchema,
  maxTempoPct: tempoPctSchema,
  accuracy: z.number().min(0).max(1).nullable(),
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
