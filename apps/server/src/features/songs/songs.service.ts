import type {
  AuthUser,
  CoverSource,
  ListSongsQuery,
  NoteHandsInput,
  SongDetail,
  SongSummary,
  UpdateSongRequest,
} from "@open-keys/contracts";
import { InvalidMidiError, notesFingerprint, parseMidiNotes } from "@open-keys/core";
import type { Database, Executor } from "../../db";
import { AppError } from "../../shared/http";
import type { Clock } from "../../shared/runtime";
import type { FileStorage } from "../../shared/storage";
import type { TagsService } from "../tags";
import { toSongDetail, toSongSummary } from "./songs.mapper";
import {
  deleteSongHands,
  findLibrarySummary,
  findSongById,
  findSongByMidiSha,
  findSongHands,
  insertSong,
  insertTracks,
  listSongsWithLibrary,
  listTracks,
  type NewSongRow,
  type NewSongTrackRow,
  type SongPatch,
  type SongRow,
  saveSongHands,
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

  /** D29: who imported a song, or an admin, may edit and delete it. */
  const canEdit = (actor: AuthUser, song: SongRow) => actor.role === "admin" || song.createdBy === actor.id;

  const requireEditable = (tx: Executor, actor: AuthUser, id: string): SongRow => {
    const song = requireSong(tx, id);
    if (!canEdit(actor, song)) {
      throw new AppError("FORBIDDEN", "Only who imported this song, or the administrator, may change it");
    }
    return song;
  };

  const detail = (actor: AuthUser, id: string): SongDetail => {
    const song = requireSong(db, id);
    const songTags = tags.tagsBySong([id]).get(id) ?? [];
    return toSongDetail(
      song,
      listTracks(db, id),
      songTags,
      findLibrarySummary(db, actor.id, id),
      findSongHands(db, id),
      canEdit(actor, song),
    );
  };

  const readMidi = async (song: SongRow): Promise<Uint8Array> => {
    const bytes = await storage.read("midi", song.midiSha256);
    if (!bytes) {
      throw new AppError("NOT_FOUND", "MIDI file missing");
    }
    return bytes;
  };

  /** A per-note assignment must have been made for the notes of this very file (D28). */
  const checkNoteHands = async (song: SongRow, noteHands: NoteHandsInput): Promise<void> => {
    let notes: ReturnType<typeof parseMidiNotes>["notes"];
    try {
      notes = parseMidiNotes(await readMidi(song)).notes;
    } catch (error) {
      throw error instanceof InvalidMidiError ? new AppError("VALIDATION_ERROR", error.message) : error;
    }
    if (noteHands.hands.length !== notes.length || noteHands.fingerprint !== notesFingerprint(notes)) {
      throw new AppError("VALIDATION_ERROR", "The hands do not match the notes of this song", {
        details: [{ path: "noteHands", message: "Computed for other notes: compute them again" }],
      });
    }
  };

  /** Shared by edition and import confirmation: metadata, tags and hand assignment. */
  const applyFields = (
    tx: Executor,
    song: SongRow,
    fields: UpdateSongRequest,
    extra: SongPatch = {},
  ): void => {
    const { tags: tagNames, tracks, noteHands, ...columns } = fields;
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
    const now = clock();
    if (noteHands === null) {
      deleteSongHands(tx, song.id);
    } else if (noteHands) {
      saveSongHands(tx, { songId: song.id, ...noteHands, updatedAt: now });
    }
    updateSong(tx, song.id, { ...columns, ...extra, updatedAt: now });
  };

  return {
    list(userId: string, query: ListSongsQuery): SongSummary[] {
      const rows = listSongsWithLibrary(db, userId, query);
      const tagsBySong = tags.tagsBySong(rows.map((row) => row.song.id));
      return rows.map(({ song, library }) => toSongSummary(song, tagsBySong.get(song.id) ?? [], library));
    },

    detail,

    async update(actor: AuthUser, id: string, fields: UpdateSongRequest): Promise<SongDetail> {
      const song = requireEditable(db, actor, id);
      if (fields.noteHands) {
        await checkNoteHands(song, fields.noteHands);
      }
      db.transaction((tx) => applyFields(tx, requireSong(tx, id), fields));
      return detail(actor, id);
    },

    /** Soft delete: the song disappears now, its data is purged after 30 days. */
    remove(actor: AuthUser, id: string): void {
      requireEditable(db, actor, id);
      const now = clock();
      updateSong(db, id, { deletedAt: now, updatedAt: now });
    },

    async midiFile(id: string): Promise<{ bytes: Uint8Array; sha256: string }> {
      const song = requireSong(db, id);
      return { bytes: await readMidi(song), sha256: song.midiSha256 };
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

    /** Re-importing a deleted song brings it back (with its history) for review, by its new importer. */
    restoreAsDraft(id: string, userId: string): void {
      updateSong(db, id, { deletedAt: null, state: "draft", createdBy: userId, updatedAt: clock() });
    },

    async confirmDraft(actor: AuthUser, id: string, fields: UpdateSongRequest): Promise<SongDetail> {
      const draft = requireEditable(db, actor, id);
      if (fields.noteHands) {
        await checkNoteHands(draft, fields.noteHands);
      }
      db.transaction((tx) => {
        const song = requireSong(tx, id);
        if (song.state !== "draft") {
          throw new AppError("CONFLICT", "This import has already been confirmed");
        }
        applyFields(tx, song, fields, { state: "ready" });
      });
      return detail(actor, id);
    },

    // ── Used by the covers feature ──

    requireSong(id: string): SongRow {
      return requireSong(db, id);
    },

    requireEditable(actor: AuthUser, id: string): SongRow {
      return requireEditable(db, actor, id);
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
