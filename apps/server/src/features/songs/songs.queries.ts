import type { ListSongsQuery } from "@open-keys/contracts";
import { and, asc, desc, eq, inArray, isNull, like, or, type SQL, sql } from "drizzle-orm";
import type { Database, Executor } from "../../db";
import { userSongs } from "../library/library.schema";
import { songTags, tags } from "../tags/tags.schema";
import { songs, songTracks } from "./songs.schema";

export type SongRow = typeof songs.$inferSelect;
export type NewSongRow = typeof songs.$inferInsert;
export type SongTrackRow = typeof songTracks.$inferSelect;
export type NewSongTrackRow = typeof songTracks.$inferInsert;
type EditableSongColumns = Omit<NewSongRow, "id" | "createdBy" | "createdAt">;
/** Undefined values are skipped by drizzle's set(). */
export type SongPatch = { [K in keyof EditableSongColumns]?: EditableSongColumns[K] | undefined };

export interface LibrarySummaryRow {
  readonly status: "to_learn" | "learning" | "mastered";
  readonly isFavorite: boolean;
  readonly lastPracticedAt: number | null;
}

export interface SongWithLibraryRow {
  readonly song: SongRow;
  readonly library: LibrarySummaryRow | null;
}

const notDeleted = isNull(songs.deletedAt);

export function findSongById(db: Executor, id: string): SongRow | undefined {
  return db
    .select()
    .from(songs)
    .where(and(eq(songs.id, id), notDeleted))
    .get();
}

/** Any song with this file, deleted ones included (deduplication). */
export function findSongByMidiSha(db: Executor, sha256: string): SongRow | undefined {
  return db.select().from(songs).where(eq(songs.midiSha256, sha256)).get();
}

export function insertSong(db: Executor, song: NewSongRow): void {
  db.insert(songs).values(song).run();
}

export function updateSong(db: Executor, id: string, patch: SongPatch): void {
  db.update(songs).set(patch).where(eq(songs.id, id)).run();
}

export function listTracks(db: Executor, songId: string): SongTrackRow[] {
  return db
    .select()
    .from(songTracks)
    .where(eq(songTracks.songId, songId))
    .orderBy(asc(songTracks.trackIndex))
    .all();
}

export function insertTracks(db: Executor, tracks: readonly NewSongTrackRow[]): void {
  if (tracks.length > 0) {
    db.insert(songTracks)
      .values([...tracks])
      .run();
  }
}

export function updateTrackHand(
  db: Executor,
  songId: string,
  trackId: string,
  hand: SongTrackRow["hand"],
): void {
  db.update(songTracks)
    .set({ hand })
    .where(and(eq(songTracks.id, trackId), eq(songTracks.songId, songId)))
    .run();
}

export function findLibrarySummary(db: Executor, userId: string, songId: string): LibrarySummaryRow | null {
  return (
    db
      .select({
        status: userSongs.status,
        isFavorite: userSongs.isFavorite,
        lastPracticedAt: userSongs.lastPracticedAt,
      })
      .from(userSongs)
      .where(and(eq(userSongs.userId, userId), eq(userSongs.songId, songId)))
      .get() ?? null
  );
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function listFilters(query: ListSongsQuery): SQL[] {
  const filters: SQL[] = [eq(songs.state, "ready"), notDeleted];
  if (query.q) {
    const pattern = `%${escapeLike(query.q.toLowerCase())}%`;
    const search = or(
      like(sql`lower(${songs.title})`, sql`${pattern} escape '\\'`),
      like(sql`lower(coalesce(${songs.composer}, ''))`, sql`${pattern} escape '\\'`),
    );
    if (search) {
      filters.push(search);
    }
  }
  if (query.difficulty && query.difficulty.length > 0) {
    filters.push(inArray(songs.difficulty, query.difficulty));
  }
  for (const tag of query.tags ?? []) {
    filters.push(
      sql`exists (select 1 from ${songTags} inner join ${tags} on ${tags.id} = ${songTags.tagId}
          where ${songTags.songId} = ${songs.id} and ${tags.name} = ${tag.toLowerCase()})`,
    );
  }
  if (query.status) {
    filters.push(sql`coalesce(${userSongs.status}, 'to_learn') = ${query.status}`);
  }
  if (query.favorite) {
    filters.push(sql`coalesce(${userSongs.isFavorite}, 0) = ${query.favorite === "true" ? 1 : 0}`);
  }
  return filters;
}

function listOrder(sort: ListSongsQuery["sort"]): SQL[] {
  switch (sort) {
    case "title":
      return [asc(sql`lower(${songs.title})`)];
    case "practiced":
      return [
        sql`${userSongs.lastPracticedAt} is null`,
        desc(userSongs.lastPracticedAt),
        desc(songs.createdAt),
      ];
    default:
      return [desc(songs.createdAt)];
  }
}

/** Visible catalogue with the personal state of `userId` (left join: never touched = null). */
export function listSongsWithLibrary(
  db: Database,
  userId: string,
  query: ListSongsQuery,
): SongWithLibraryRow[] {
  const rows = db
    .select({
      song: songs,
      status: userSongs.status,
      isFavorite: userSongs.isFavorite,
      lastPracticedAt: userSongs.lastPracticedAt,
    })
    .from(songs)
    .leftJoin(userSongs, and(eq(userSongs.songId, songs.id), eq(userSongs.userId, userId)))
    .where(and(...listFilters(query)))
    .orderBy(...listOrder(query.sort))
    .all();
  return rows.map((row) => ({
    song: row.song,
    library:
      row.status === null
        ? null
        : { status: row.status, isFavorite: row.isFavorite ?? false, lastPracticedAt: row.lastPracticedAt },
  }));
}
