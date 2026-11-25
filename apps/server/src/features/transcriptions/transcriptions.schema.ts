import { TRANSCRIPTION_ERRORS, TRANSCRIPTION_STATUSES } from "@open-keys/contracts";
import { sql } from "drizzle-orm";
import { check, index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "../auth/auth.schema";
import { songs } from "../songs/songs.schema";

/**
 * Recordings sent to be turned into MIDI (D34). The recording itself is a temporary file (storage
 * kind "audio"), removed once transcribed or failed: only the resulting draft song stays.
 */
export const transcriptionJobs = sqliteTable(
  "transcription_jobs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Name of the file sent, for the user (never used as a path). */
    fileName: text("file_name").notNull(),
    /** The recording sent, in the file storage until the job ends (then kept by the song, D35). */
    audioSha256: text("audio_sha256"),
    /** Or the URL of the recording at an allowed audio source (AUDIO_SOURCES), downloaded when transcribed. */
    sourceUrl: text("source_url"),
    status: text("status", { enum: TRANSCRIPTION_STATUSES }).notNull(),
    durationS: real("duration_s"),
    songId: text("song_id").references(() => songs.id, { onDelete: "set null" }),
    error: text("error", { enum: TRANSCRIPTION_ERRORS }),
    createdAt: integer("created_at").notNull(),
    startedAt: integer("started_at"),
    finishedAt: integer("finished_at"),
  },
  (table) => [
    index("transcription_jobs_status_idx").on(table.status, table.createdAt),
    index("transcription_jobs_user_idx").on(table.userId, table.createdAt),
    check("transcription_jobs_status_check", sql`${table.status} in ('queued', 'running', 'done', 'failed')`),
  ],
);
