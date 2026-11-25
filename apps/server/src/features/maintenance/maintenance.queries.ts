import { and, eq, inArray, isNotNull, lt } from "drizzle-orm";
import type { Executor } from "../../db";
import { songs } from "../songs/songs.schema";
import { transcriptionJobs } from "../transcriptions/transcriptions.schema";

export function findAbandonedDraftIds(db: Executor, createdBefore: number): string[] {
  return db
    .select({ id: songs.id })
    .from(songs)
    .where(and(eq(songs.state, "draft"), lt(songs.createdAt, createdBefore)))
    .all()
    .map((row) => row.id);
}

export function findExpiredDeletedSongIds(db: Executor, deletedBefore: number): string[] {
  return db
    .select({ id: songs.id })
    .from(songs)
    .where(and(isNotNull(songs.deletedAt), lt(songs.deletedAt, deletedBefore)))
    .all()
    .map((row) => row.id);
}

/** Hard delete: tracks, tags links, loops, sessions and library entries follow by cascade. */
export function deleteSongs(db: Executor, ids: readonly string[]): number {
  if (ids.length === 0) {
    return 0;
  }
  return db
    .delete(songs)
    .where(inArray(songs.id, [...ids]))
    .run().changes;
}

export function referencedFiles(db: Executor): {
  midi: Set<string>;
  covers: Set<string>;
  audio: Set<string>;
} {
  const rows = db.select({ midi: songs.midiSha256, cover: songs.coverSha256 }).from(songs).all();
  // Recordings still waiting for their transcription (D34).
  const recordings = db.select({ audio: transcriptionJobs.audioSha256 }).from(transcriptionJobs).all();
  return {
    midi: new Set(rows.map((row) => row.midi)),
    covers: new Set(rows.flatMap((row) => (row.cover ? [row.cover] : []))),
    audio: new Set(recordings.flatMap((row) => (row.audio ? [row.audio] : []))),
  };
}
