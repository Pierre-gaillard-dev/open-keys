import { z } from "zod";
import { timestampSchema, ulidSchema } from "./common.contract";

/**
 * A recording being turned into a MIDI (D34): queued, transcribed (one at a time on the server), then
 * imported as a draft to review, like an uploaded MIDI file.
 */
export const TRANSCRIPTION_STATUSES = ["queued", "running", "done", "failed"] as const;
export const transcriptionStatusSchema = z.enum(TRANSCRIPTION_STATUSES);
export type TranscriptionStatus = z.infer<typeof transcriptionStatusSchema>;

/** Why a transcription failed: the app explains each one. */
export const TRANSCRIPTION_ERRORS = ["unreadable", "no_notes", "too_long", "unreachable", "failed"] as const;
export const transcriptionErrorSchema = z.enum(TRANSCRIPTION_ERRORS);
export type TranscriptionError = z.infer<typeof transcriptionErrorSchema>;

/** Longest recording transcribed (the transcriber stops there). */
export const MAX_TRANSCRIPTION_SECONDS = 15 * 60;

/** File extensions accepted (anything ffmpeg reads; these are the common ones). */
export const AUDIO_EXTENSIONS = [
  ".mp3",
  ".opus",
  ".ogg",
  ".oga",
  ".m4a",
  ".aac",
  ".wav",
  ".flac",
  ".webm",
] as const;

export const transcriptionJobSchema = z.object({
  id: ulidSchema,
  fileName: z.string(),
  status: transcriptionStatusSchema,
  /** Duration of the recording measured by the browser, for the time estimate; null if unknown. */
  durationS: z.number().nonnegative().nullable(),
  /** Jobs before this one in the queue (0: next); null once started. */
  queuePosition: z.number().int().nonnegative().nullable(),
  /** The draft created from the transcription, to review. */
  songId: ulidSchema.nullable(),
  error: transcriptionErrorSchema.nullable(),
  createdAt: timestampSchema,
  startedAt: timestampSchema.nullable(),
  finishedAt: timestampSchema.nullable(),
});

export type TranscriptionJob = z.infer<typeof transcriptionJobSchema>;

export const transcriptionsSchema = z.object({
  /** False when the server has no transcriber (TRANSCRIBER_URL unset). */
  available: z.boolean(),
  /** True when recordings may also come from an allowed audio source by URL (AUDIO_SOURCES, D35). */
  acceptsUrls: z.boolean(),
  /** The user's recent transcriptions, most recent first. */
  jobs: z.array(transcriptionJobSchema),
});

export type Transcriptions = z.infer<typeof transcriptionsSchema>;

/**
 * A recording at an allowed audio source (D35): the app that fetches the recordings. The song keeps
 * the URL, to play along with the original.
 */
export const transcriptionUrlRequestSchema = z.object({
  url: z.url({ protocol: /^https?$/ }).max(2000),
  /** Title of the piece; by default, the name of the file in the URL. */
  title: z.string().trim().min(1).max(200).optional(),
  /** Duration of the recording when known, for the time estimate. */
  durationS: z
    .number()
    .nonnegative()
    .max(24 * 60 * 60)
    .optional(),
});

export type TranscriptionUrlRequest = z.infer<typeof transcriptionUrlRequestSchema>;
