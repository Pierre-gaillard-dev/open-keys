import type {
  CoverSource,
  ListSongsQuery,
  SongDetail,
  SongSummary,
  UpdateSongRequest,
} from "@open-keys/contracts";
import type { Database, Executor } from "../../db";
import { AppError } from "../../shared/http";
import type { Clock } from "../../shared/runtime";
import type { FileStorage } from "../../shared/storage";
import type { TagsService } from "../tags";
import { toSongDetail, toSongSummary } from "./songs.mapper";
import {
  findLibrarySummary,
  findSongById,
  findSongByMidiSha,
  insertSong,
  insertTracks,
  listSongsWithLibrary,
  listTracks,
  type NewSongRow,
  type NewSongTrackRow,
  type SongPatch,
  type SongRow,
  updateSong,
  updateTrackHand,
} from "./songs.queries";

export interface SongsServiceDeps {
  readonly db: Database;
  readonly clock: Clock;
  readonly storage: FileStorage;
  readonly tags: TagsService;
}

export interface SongCover {
  readonly sha256: string;
  readonly source: CoverSource;
  readonly credit: string | null;
}

export type SongsService = ReturnType<typeof createSongsService>;

export function createSongsService({ db, clock, storage, tags }: SongsServiceDeps) {
  const requireSong = (tx: Executor, id: string): SongRow => {
    const song = findSongById(tx, id);
    if (!song) {
      throw new AppError("NOT_FOUND", "Song not found");
    }
    return song;
  };

  const detail = (userId: string, id: string): SongDetail => {
    const song = requireSong(db, id);
    const songTags = tags.tagsBySong([id]).get(id) ?? [];
    return toSongDetail(song, listTracks(db, id), songTags, findLibrarySummary(db, userId, id));
  };

  /** Shared by edition and import confirmation: metadata, tags and hand assignment. */
  const applyFields = (
    tx: Executor,
    song: SongRow,
    fields: UpdateSongRequest,
    extra: SongPatch = {},
  ): void => {
    const { tags: tagNames, tracks, ...columns } = fields;
    if (tracks) {
      const known = new Set(listTracks(tx, song.id).map((track) => track.id));
      const unknown = tracks.find((track) => !known.has(track.id));
      if (unknown) {
        throw new AppError("VALIDATION_ERROR", "Unknown track", {
          details: [{ path: "tracks", message: `Track ${unknown.id} does not belong to this song` }],
        });
      }
      for (const track of tracks) {
        updateTrackHand(tx, song.id, track.id, track.hand);
      }
    }
    if (tagNames) {
      tags.replaceSongTags(tx, song.id, tagNames);
    }
    updateSong(tx, song.id, { ...columns, ...extra, updatedAt: clock() });
  };

  return {
    list(userId: string, query: ListSongsQuery): SongSummary[] {
      const rows = listSongsWithLibrary(db, userId, query);
      const tagsBySong = tags.tagsBySong(rows.map((row) => row.song.id));
      return rows.map(({ song, library }) => toSongSummary(song, tagsBySong.get(song.id) ?? [], library));
    },

    detail,

    update(userId: string, id: string, fields: UpdateSongRequest): SongDetail {
      db.transaction((tx) => applyFields(tx, requireSong(tx, id), fields));
      return detail(userId, id);
    },

    /** Soft delete: the song disappears now, its data is purged after 30 days. */
    remove(id: string): void {
      requireSong(db, id);
      const now = clock();
      updateSong(db, id, { deletedAt: now, updatedAt: now });
    },

    async midiFile(id: string): Promise<{ bytes: Uint8Array; sha256: string }> {
      const song = requireSong(db, id);
      const bytes = await storage.read("midi", song.midiSha256);
      if (!bytes) {
        throw new AppError("NOT_FOUND", "MIDI file missing");
      }
      return { bytes, sha256: song.midiSha256 };
    },

    // ── Used by the imports feature ──

    findByMidiSha(sha256: string): SongRow | undefined {
      return findSongByMidiSha(db, sha256);
    },

    createDraft(song: NewSongRow, tracks: readonly NewSongTrackRow[]): void {
      db.transaction((tx) => {
        insertSong(tx, song);
        insertTracks(tx, tracks);
      });
    },

    /** Re-importing a deleted song brings it back (with its history) for review. */
    restoreAsDraft(id: string): void {
      updateSong(db, id, { deletedAt: null, state: "draft", updatedAt: clock() });
    },

    confirmDraft(userId: string, id: string, fields: UpdateSongRequest): SongDetail {
      db.transaction((tx) => {
        const song = requireSong(tx, id);
        if (song.state !== "draft") {
          throw new AppError("CONFLICT", "This import has already been confirmed");
        }
        applyFields(tx, song, fields, { state: "ready" });
      });
      return detail(userId, id);
    },

    // ── Used by the covers feature ──

    requireSong(id: string): SongRow {
      return requireSong(db, id);
    },

    setCover(id: string, cover: SongCover | null): void {
      requireSong(db, id);
      updateSong(db, id, {
        coverSha256: cover?.sha256 ?? null,
        coverSource: cover?.source ?? null,
        coverCredit: cover?.credit ?? null,
        updatedAt: clock(),
      });
    },
  };
}
