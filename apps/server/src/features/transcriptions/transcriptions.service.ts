import {
  AUDIO_EXTENSIONS,
  type AuthUser,
  MAX_TRANSCRIPTION_SECONDS,
  type TranscriptionJob,
  type Transcriptions,
} from "@open-keys/contracts";
import type { Database } from "../../db";
import { AppError, type SafeFetch } from "../../shared/http";
import type { Logger } from "../../shared/logger";
import type { Clock, IdGenerator } from "../../shared/runtime";
import type { FileStorage } from "../../shared/storage";
import type { AuthService } from "../auth";
import type { ImportsService } from "../imports";
import { isAllowedAudioUrl, type SongAudio, type SongsService } from "../songs";
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
/** A recording of the audio source: up to 40 MB, on the same server. */
const DOWNLOAD_TIMEOUT_MS = 2 * 60_000;

export interface TranscriptionsServiceDeps {
  readonly db: Database;
  readonly storage: FileStorage;
  readonly imports: ImportsService;
  readonly songs: SongsService;
  readonly auth: AuthService;
  /** Null when the server has no transcriber (TRANSCRIBER_URL unset). */
  readonly transcriber: TranscriberClient | null;
  readonly safeFetch: SafeFetch;
  /** AUDIO_SOURCES: the origins whose recordings may be transcribed by URL (D35). */
  readonly audioSources: readonly string[];
  readonly clock: Clock;
  readonly newId: IdGenerator;
  readonly logger: Logger;
  readonly maxAudioSize: number;
}

/** What to transcribe: a file sent (kept in the storage), or a URL of an allowed audio source. */
type Recording =
  | { readonly kind: "file"; readonly bytes: Uint8Array; readonly fileName: string }
  | { readonly kind: "url"; readonly url: string; readonly title: string | null };

export type TranscriptionsService = ReturnType<typeof createTranscriptionsService>;

const hasAudioExtension = (name: string) =>
  AUDIO_EXTENSIONS.some((extension) => name.toLowerCase().endsWith(extension));

/** "https://music.example.org/files/One%20More%20Light.opus" → "One More Light.opus". */
function nameOfUrl(url: string): string {
  const last = new URL(url).pathname.split("/").filter(Boolean).at(-1) ?? "";
  try {
    return decodeURIComponent(last) || "Enregistrement";
  } catch {
    return last || "Enregistrement";
  }
}

/**
 * Recordings turned into MIDI (D34): a recording (a file sent, or the URL of the app that fetches
 * recordings) is queued, transcribed by the transcriber service (one at a time), then imported as a
 * draft to review like an uploaded MIDI. The song keeps its recording, to play along with it (D35):
 * the URL, or the file sent (removed if the transcription fails).
 */
export function createTranscriptionsService(deps: TranscriptionsServiceDeps) {
  const { db, storage, imports, songs, auth, transcriber, safeFetch, clock, newId, logger } = deps;

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

  /** Failed: the file sent is not needed any more (a URL is not ours). */
  const fail = async (job: TranscriptionJobRow, error: TranscriptionJob["error"]) => {
    updateJob(db, job.id, { status: "failed", error, audioSha256: null, finishedAt: clock() });
    if (job.audioSha256) {
      await storage.remove("audio", job.audioSha256);
    }
  };

  /** The recording of a job: the file kept, or downloaded from its allowed source. */
  const recordingOf = async (job: TranscriptionJobRow): Promise<Uint8Array> => {
    if (job.audioSha256) {
      const bytes = await storage.read("audio", job.audioSha256);
      if (!bytes) {
        throw new TranscriptionFailure("failed");
      }
      return bytes;
    }
    if (!(job.sourceUrl && isAllowedAudioUrl(job.sourceUrl, deps.audioSources))) {
      throw new TranscriptionFailure("unreachable");
    }
    try {
      const { bytes } = await safeFetch(job.sourceUrl, {
        maxBytes: deps.maxAudioSize,
        timeoutMs: DOWNLOAD_TIMEOUT_MS,
        accept: "audio/*",
      });
      return bytes;
    } catch (error) {
      throw new TranscriptionFailure(
        error instanceof AppError && error.code === "PAYLOAD_TOO_LARGE" ? "too_long" : "unreachable",
      );
    }
  };

  const transcribe = async (job: TranscriptionJobRow, client: TranscriberClient) => {
    const actor = auth.findAuthUser(job.userId);
    if (!actor) {
      await fail(job, "failed");
      return;
    }
    const audio = await recordingOf(job);
    const midi = await client.transcribe(audio, job.fileName.replace(/\.[^.]+$/, ""));
    const { song } = await imports.importTranscription(actor, midi, job.fileName);
    const kept: SongAudio = job.audioSha256
      ? { kind: "file", sha256: job.audioSha256 }
      : { kind: "url", url: job.sourceUrl ?? "" };
    songs.attachAudio(song.id, kept);
    // The file now belongs to the song: the job lets it go.
    updateJob(db, job.id, { status: "done", songId: song.id, audioSha256: null, finishedAt: clock() });
    logger.info("Recording transcribed", { jobId: job.id, songId: song.id, notes: song.noteCount });
  };

  const queue = async (actor: AuthUser, recording: Recording, durationS: number | null) => {
    if (!transcriber) {
      throw new AppError("SERVICE_UNAVAILABLE", "This server has no transcriber");
    }
    if (durationS !== null && durationS > MAX_TRANSCRIPTION_SECONDS) {
      throw new AppError("VALIDATION_ERROR", "Recording too long", {
        details: [{ path: "durationS", message: `${MAX_TRANSCRIPTION_SECONDS / 60} minutes au plus` }],
      });
    }
    if (countPendingOfUser(db, actor.id) >= MAX_PENDING_PER_USER) {
      throw new AppError("RATE_LIMITED", `At most ${MAX_PENDING_PER_USER} recordings waiting at once`);
    }
    const stored = recording.kind === "file" ? await storage.put("audio", recording.bytes) : null;
    const fileName =
      recording.kind === "file" ? recording.fileName : (recording.title ?? nameOfUrl(recording.url));
    const row: TranscriptionJobRow = {
      id: newId(),
      userId: actor.id,
      fileName: fileName.slice(0, MAX_FILE_NAME),
      audioSha256: stored?.sha256 ?? null,
      sourceUrl: recording.kind === "url" ? recording.url : null,
      status: "queued",
      durationS,
      songId: null,
      error: null,
      createdAt: clock(),
      startedAt: null,
      finishedAt: null,
    };
    insertJob(db, row);
    logger.info("Recording queued for transcription", { jobId: row.id, source: recording.kind });
    return toDto(row, listQueued(db));
  };

  return {
    get available(): boolean {
      return transcriber !== null;
    },

    /** A file sent from the user's device. */
    submit(
      actor: AuthUser,
      bytes: Uint8Array,
      fileName: string,
      durationS: number | null,
    ): Promise<TranscriptionJob> {
      if (!hasAudioExtension(fileName)) {
        throw new AppError("VALIDATION_ERROR", "Not an audio file", {
          details: [{ path: "file", message: `Formats acceptés : ${AUDIO_EXTENSIONS.join(", ")}` }],
        });
      }
      if (bytes.byteLength === 0 || bytes.byteLength > deps.maxAudioSize) {
        throw new AppError("PAYLOAD_TOO_LARGE", `Recordings are limited to ${deps.maxAudioSize} bytes`);
      }
      return queue(actor, { kind: "file", bytes, fileName }, durationS);
    },

    /** The URL of a recording at an allowed audio source (D35): the song keeps the URL. */
    submitUrl(
      actor: AuthUser,
      url: string,
      title: string | null,
      durationS: number | null,
    ): Promise<TranscriptionJob> {
      if (!isAllowedAudioUrl(url, deps.audioSources)) {
        throw new AppError("VALIDATION_ERROR", "This address is not an allowed audio source", {
          details: [{ path: "url", message: "Adresse non autorisée (sources audio du serveur)" }],
        });
      }
      return queue(actor, { kind: "url", url, title }, durationS);
    },

    list(actor: AuthUser): Transcriptions {
      const queued = listQueued(db);
      return {
        available: transcriber !== null,
        acceptsUrls: transcriber !== null && deps.audioSources.length > 0,
        jobs: listJobsOfUser(db, actor.id, LISTED_JOBS).map((row) => toDto(row, queued)),
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
        await fail(job, code);
        logger.warn("Transcription failed", { jobId: job.id, code, error });
      }
    },
  };
}
