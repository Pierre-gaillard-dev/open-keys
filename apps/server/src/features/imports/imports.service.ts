import type { ConfirmImportRequest, SongDetail } from "@open-keys/contracts";
import { analyzeMidi, InvalidMidiError, type MidiAnalysis, suggestHandMapping } from "@open-keys/core";
import { AppError, type SafeFetch } from "../../shared/http";
import type { Logger } from "../../shared/logger";
import type { Clock, IdGenerator } from "../../shared/runtime";
import { type FileStorage, sha256Of } from "../../shared/storage";
import type { CoversService } from "../covers";
import type { SongsService } from "../songs";

export type ImportSource =
  | { readonly type: "upload"; readonly filename: string }
  | { readonly type: "url"; readonly url: string }
  | { readonly type: "mutopia"; readonly url: string; readonly metadata: KnownMetadata };

/** What the source already knows (Mutopia index): pre-filled on the review screen. */
export interface KnownMetadata {
  readonly title: string;
  readonly composer: string;
  readonly license: string;
}

export interface ImportsServiceDeps {
  readonly songs: SongsService;
  readonly covers: CoversService;
  readonly storage: FileStorage;
  readonly safeFetch: SafeFetch;
  readonly clock: Clock;
  readonly newId: IdGenerator;
  readonly logger: Logger;
  readonly maxMidiSize: number;
}

export interface ImportResult {
  readonly song: SongDetail;
  /** False when an existing draft (or a deleted song, restored) was returned instead. */
  readonly created: boolean;
}

export type ImportsService = ReturnType<typeof createImportsService>;

const MAX_TITLE_LENGTH = 200;

/** "gymnopedie_1.mid" → "gymnopedie 1" */
export function titleFromName(name: string): string {
  const base = name
    .replace(/\.(mid|midi|kar)$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return base.slice(0, MAX_TITLE_LENGTH) || "Sans titre";
}

function suggestedTitle(analysis: MidiAnalysis, source: ImportSource): string {
  if (source.type === "mutopia") {
    return source.metadata.title.slice(0, MAX_TITLE_LENGTH);
  }
  if (analysis.title) {
    return analysis.title.slice(0, MAX_TITLE_LENGTH);
  }
  if (source.type === "upload") {
    return titleFromName(source.filename);
  }
  const lastSegment = new URL(source.url).pathname.split("/").filter(Boolean).at(-1) ?? "";
  return titleFromName(decodeURIComponent(lastSegment));
}

/** Fields of the draft that depend on where the file comes from. */
function draftOrigin(analysis: MidiAnalysis, source: ImportSource) {
  const known = source.type === "mutopia" ? source.metadata : null;
  return {
    title: suggestedTitle(analysis, source),
    composer: known?.composer ?? null,
    license: known?.license ?? null,
    sourceType: source.type,
    sourceUrl: source.type === "upload" ? null : source.url,
  };
}

function analyze(bytes: Uint8Array): MidiAnalysis {
  try {
    return analyzeMidi(bytes);
  } catch (error) {
    if (error instanceof InvalidMidiError) {
      throw new AppError("VALIDATION_ERROR", `Invalid MIDI file: ${error.message}`);
    }
    throw error;
  }
}

export function createImportsService(deps: ImportsServiceDeps) {
  const { songs, covers, storage, safeFetch, clock, newId, logger, maxMidiSize } = deps;

  const downloadMidi = async (url: string): Promise<Uint8Array> => {
    const { bytes } = await safeFetch(url, {
      maxBytes: maxMidiSize,
      accept: "audio/midi, audio/x-midi, */*",
    });
    return bytes;
  };

  const importBytes = async (
    userId: string,
    bytes: Uint8Array,
    source: ImportSource,
  ): Promise<ImportResult> => {
    if (bytes.byteLength > maxMidiSize) {
      throw new AppError("PAYLOAD_TOO_LARGE", `MIDI files are limited to ${maxMidiSize} bytes`);
    }
    const analysis = analyze(bytes);
    const sha256 = sha256Of(bytes);

    const existing = songs.findByMidiSha(sha256);
    if (existing && existing.deletedAt === null && existing.state === "ready") {
      throw new AppError("CONFLICT", "This MIDI file is already in the catalogue", {
        details: { songId: existing.id, title: existing.title },
      });
    }
    if (existing) {
      if (existing.deletedAt !== null) {
        songs.restoreAsDraft(existing.id);
      }
      return { song: songs.detail(userId, existing.id), created: false };
    }

    await storage.put("midi", bytes);
    const now = clock();
    const songId = newId();
    const mapping = suggestHandMapping(analysis.tracks);
    const handByTrack = new Map(mapping.tracks.map((track) => [track.trackIndex, track.hand]));
    songs.createDraft(
      {
        id: songId,
        createdBy: userId,
        state: "draft",
        ...draftOrigin(analysis, source),
        midiSha256: sha256,
        midiSize: bytes.byteLength,
        durationMs: analysis.durationMs,
        noteCount: analysis.noteCount,
        minPitch: analysis.minPitch,
        maxPitch: analysis.maxPitch,
        handMode: mapping.mode,
        splitPitch: mapping.splitPitch,
        createdAt: now,
        updatedAt: now,
      },
      analysis.tracks.map((track) => ({
        id: newId(),
        songId,
        trackIndex: track.index,
        channel: track.channel,
        name: track.name,
        instrument: track.instrument,
        noteCount: track.noteCount,
        minPitch: track.minPitch,
        maxPitch: track.maxPitch,
        hand: handByTrack.get(track.index) ?? "ignore",
      })),
    );
    logger.info("MIDI imported as draft", { songId, sourceType: source.type, notes: analysis.noteCount });
    return { song: songs.detail(userId, songId), created: true };
  };

  return {
    importFile(userId: string, bytes: Uint8Array, filename: string): Promise<ImportResult> {
      return importBytes(userId, bytes, { type: "upload", filename });
    },

    async importUrl(userId: string, url: string): Promise<ImportResult> {
      return importBytes(userId, await downloadMidi(url), { type: "url", url });
    },

    /** A piece of a known library (Mutopia): its metadata is pre-filled for the review (UC-20). */
    async importFromLibrary(userId: string, url: string, metadata: KnownMetadata): Promise<ImportResult> {
      return importBytes(userId, await downloadMidi(url), { type: "mutopia", url, metadata });
    },

    downloadMidi,

    async confirm(userId: string, songId: string, request: ConfirmImportRequest): Promise<SongDetail> {
      const { coverSuggestionId, ...fields } = request;
      songs.confirmDraft(userId, songId, fields);
      if (coverSuggestionId) {
        try {
          await covers.applySuggestion(songId, coverSuggestionId);
        } catch (error) {
          // The import itself succeeded: a missing cover can be chosen again from the song page.
          logger.warn("Cover suggestion could not be applied", { songId, error });
        }
      }
      return songs.detail(userId, songId);
    },
  };
}
