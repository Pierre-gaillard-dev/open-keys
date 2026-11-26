import {
  AUDIO_EXTENSIONS,
  type AuthUser,
  MAX_TRANSCRIPTION_SECONDS,
  type TranscriptionJob,
  type Transcriptions,
} from "@open-keys/contracts";
import type { Database } from "../../db";
import { AppError } from "../../shared/http";
import type { Logger } from "../../shared/logger";
import type { Clock, IdGenerator } from "../../shared/runtime";
import type { FileStorage } from "../../shared/storage";
import type { AuthService } from "../auth";
import type { ImportsService } from "../imports";
import { type TranscriberClient, TranscriberUnavailable, TranscriptionFailure } from "./transcriber-client";
import {
  countPendingOfUser,
  findJob,
  insertJob,
  listJobsOfUser,
  listQueued,
  requeueRunning,
  type TranscriptionJobRow,
  updateJob,
} from "./transcriptions.queries";

/** Transcriptions shown to a user (most recent first). */
const LISTED_JOBS = 20;
/** Recordings a user may have waiting at once: the server transcribes one at a time. */
export const MAX_PENDING_PER_USER = 3;
const MAX_FILE_NAME = 200;

export interface TranscriptionsServiceDeps {
  readonly db: Database;
  readonly storage: FileStorage;
  readonly imports: ImportsService;
  readonly auth: AuthService;
  /** Null when the server has no transcriber (TRANSCRIBER_URL unset). */
  readonly transcriber: TranscriberClient | null;
  readonly clock: Clock;
  readonly newId: IdGenerator;
  readonly logger: Logger;
  readonly maxAudioSize: number;
}

export type TranscriptionsService = ReturnType<typeof createTranscriptionsService>;

const hasAudioExtension = (name: string) =>
  AUDIO_EXTENSIONS.some((extension) => name.toLowerCase().endsWith(extension));

/**
 * Recordings turned into MIDI (D34): a recording sent by a user is queued, transcribed by the
 * transcriber service (one at a time), then imported as a draft to review like an uploaded MIDI.
 * The recording is removed as soon as it is transcribed or has failed.
 */
export function createTranscriptionsService(deps: TranscriptionsServiceDeps) {
  const { db, storage, imports, auth, transcriber, clock, newId, logger, maxAudioSize } = deps;

  const toDto = (row: TranscriptionJobRow, queue: readonly TranscriptionJobRow[]): TranscriptionJob => {
    const position = queue.findIndex((queued) => queued.id === row.id);
    return {
      id: row.id,
      fileName: row.fileName,
      status: row.status,
      durationS: row.durationS,
      queuePosition: position === -1 ? null : position,
      songId: row.songId,
      error: row.error,
      createdAt: row.createdAt,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
    };
  };

  /** Done or failed: the recording is not needed any more. */
  const finish = async (job: TranscriptionJobRow, patch: Partial<TranscriptionJobRow>) => {
    updateJob(db, job.id, { ...patch, audioSha256: null, finishedAt: clock() });
    if (job.audioSha256) {
      await storage.remove("audio", job.audioSha256);
    }
  };

  const transcribe = async (job: TranscriptionJobRow, client: TranscriberClient) => {
    const audio = job.audioSha256 ? await storage.read("audio", job.audioSha256) : undefined;
    const actor = auth.findAuthUser(job.userId);
    if (!(audio && actor)) {
      await finish(job, { status: "failed", error: "failed" });
      return;
    }
    const title = job.fileName.replace(/\.[^.]+$/, "");
    const midi = await client.transcribe(audio, title);
    const { song } = await imports.importTranscription(actor, midi, job.fileName);
    await finish(job, { status: "done", songId: song.id });
    logger.info("Recording transcribed", { jobId: job.id, songId: song.id, notes: song.noteCount });
  };

  return {
    get available(): boolean {
      return transcriber !== null;
    },

    async submit(
      actor: AuthUser,
      bytes: Uint8Array,
      fileName: string,
      durationS: number | null,
    ): Promise<TranscriptionJob> {
      if (!transcriber) {
        throw new AppError("SERVICE_UNAVAILABLE", "This server has no transcriber");
      }
      if (!hasAudioExtension(fileName)) {
        throw new AppError("VALIDATION_ERROR", "Not an audio file", {
          details: [{ path: "file", message: `Formats acceptés : ${AUDIO_EXTENSIONS.join(", ")}` }],
        });
      }
      if (bytes.byteLength === 0 || bytes.byteLength > maxAudioSize) {
        throw new AppError("PAYLOAD_TOO_LARGE", `Recordings are limited to ${maxAudioSize} bytes`);
      }
      if (durationS !== null && durationS > MAX_TRANSCRIPTION_SECONDS) {
        throw new AppError("VALIDATION_ERROR", "Recording too long", {
          details: [{ path: "durationS", message: `${MAX_TRANSCRIPTION_SECONDS / 60} minutes au plus` }],
        });
      }
      if (countPendingOfUser(db, actor.id) >= MAX_PENDING_PER_USER) {
        throw new AppError("RATE_LIMITED", `At most ${MAX_PENDING_PER_USER} recordings waiting at once`);
      }
      const { sha256 } = await storage.put("audio", bytes);
      const row: TranscriptionJobRow = {
        id: newId(),
        userId: actor.id,
        fileName: fileName.slice(0, MAX_FILE_NAME),
        audioSha256: sha256,
        status: "queued",
        durationS,
        songId: null,
        error: null,
        createdAt: clock(),
        startedAt: null,
        finishedAt: null,
      };
      insertJob(db, row);
      logger.info("Recording queued for transcription", { jobId: row.id, bytes: bytes.byteLength });
      return toDto(row, listQueued(db));
    },

    list(actor: AuthUser): Transcriptions {
      const queue = listQueued(db);
      return {
        available: transcriber !== null,
        jobs: listJobsOfUser(db, actor.id, LISTED_JOBS).map((row) => toDto(row, queue)),
      };
    },

    get(actor: AuthUser, id: string): TranscriptionJob {
      const row = findJob(db, id);
      if (!row || row.userId !== actor.id) {
        throw new AppError("NOT_FOUND", "Transcription not found");
      }
      return toDto(row, listQueued(db));
    },

    /** At startup: jobs interrupted by a stop of the server are queued again. */
    recover(): number {
      return requeueRunning(db);
    },

    /**
     * Transcribes the oldest queued recording, if any (the periodic worker; never two at once). A busy
     * or unreachable transcriber puts it back in the queue.
     */
    async processNext(): Promise<void> {
      const job = listQueued(db)[0];
      if (!(transcriber && job)) {
        return;
      }
      updateJob(db, job.id, { status: "running", startedAt: clock() });
      try {
        await transcribe(job, transcriber);
      } catch (error) {
        if (error instanceof TranscriberUnavailable) {
          updateJob(db, job.id, { status: "queued", startedAt: null });
          logger.warn("Transcriber unavailable, job queued again", { jobId: job.id, error: error.message });
          return;
        }
        const code = error instanceof TranscriptionFailure ? error.code : "failed";
        await finish(job, { status: "failed", error: code });
        logger.warn("Transcription failed", { jobId: job.id, code, error });
      }
    },
  };
}
