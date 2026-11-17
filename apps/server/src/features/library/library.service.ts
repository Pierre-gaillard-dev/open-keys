import type { LibraryEntry, PutLibraryEntryRequest } from "@open-keys/contracts";
import type { Database } from "../../db";
import { AppError } from "../../shared/http";
import type { PracticeService } from "../practice";
import type { SongsService } from "../songs";
import { findLibraryEntry, type LibraryRow, listLibraryEntries, upsertLibraryEntry } from "./library.queries";

export interface LibraryServiceDeps {
  readonly db: Database;
  readonly songs: SongsService;
  readonly practice: PracticeService;
}

export type LibraryService = ReturnType<typeof createLibraryService>;

function toLibraryEntry(row: LibraryRow): LibraryEntry {
  const { userId: _userId, ...entry } = row;
  return entry;
}

export function createLibraryService({ db, songs, practice }: LibraryServiceDeps) {
  return {
    list(userId: string): LibraryEntry[] {
      return listLibraryEntries(db, userId).map(toLibraryEntry);
    },

    /**
     * Upsert of the personal state of a song (last-write-wins on updatedAt).
     * A last loop that is unknown (not synced yet, deleted, someone else's) is stored as null.
     */
    put(userId: string, songId: string, request: PutLibraryEntryRequest): LibraryEntry {
      songs.requireSong(songId);
      const lastLoopId =
        request.lastLoopId && practice.ownsActiveLoop(userId, songId, request.lastLoopId)
          ? request.lastLoopId
          : null;
      upsertLibraryEntry(db, { ...request, lastLoopId, userId, songId });
      const stored = findLibraryEntry(db, userId, songId);
      if (!stored) {
        throw new AppError("INTERNAL_ERROR", "Library entry was not stored");
      }
      return toLibraryEntry(stored);
    },
  };
}
