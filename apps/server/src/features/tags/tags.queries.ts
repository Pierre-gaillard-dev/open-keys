import { and, asc, count, eq, inArray, isNull, notInArray } from "drizzle-orm";
import type { Database, Executor } from "../../db";
import { songs } from "../songs/songs.schema";
import { songTags, tags } from "./tags.schema";

export function findTagIdsByName(db: Executor, names: readonly string[]): Map<string, string> {
  if (names.length === 0) {
    return new Map();
  }
  const rows = db
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .where(inArray(tags.name, [...names]))
    .all();
  return new Map(rows.map((row) => [row.name, row.id]));
}

export function insertTags(db: Executor, rows: readonly { id: string; name: string }[]): void {
  if (rows.length > 0) {
    db.insert(tags)
      .values([...rows])
      .run();
  }
}

export function replaceSongTagLinks(db: Executor, songId: string, tagIds: readonly string[]): void {
  db.delete(songTags).where(eq(songTags.songId, songId)).run();
  if (tagIds.length > 0) {
    db.insert(songTags)
      .values(tagIds.map((tagId) => ({ songId, tagId })))
      .run();
  }
}

export function tagNamesBySong(db: Database, songIds: readonly string[]): Map<string, string[]> {
  const result = new Map<string, string[]>();
  if (songIds.length === 0) {
    return result;
  }
  const rows = db
    .select({ songId: songTags.songId, name: tags.name })
    .from(songTags)
    .innerJoin(tags, eq(tags.id, songTags.tagId))
    .where(inArray(songTags.songId, [...songIds]))
    .orderBy(asc(tags.name))
    .all();
  for (const row of rows) {
    result.set(row.songId, [...(result.get(row.songId) ?? []), row.name]);
  }
  return result;
}

/** Tags used by at least one visible (ready, not deleted) song. */
export function listTagsWithCounts(db: Database) {
  return db
    .select({ name: tags.name, songCount: count(songTags.songId) })
    .from(tags)
    .innerJoin(songTags, eq(songTags.tagId, tags.id))
    .innerJoin(songs, eq(songs.id, songTags.songId))
    .where(and(eq(songs.state, "ready"), isNull(songs.deletedAt)))
    .groupBy(tags.id)
    .orderBy(asc(tags.name))
    .all();
}

export function deleteUnusedTags(db: Database): number {
  const usedTagIds = db.select({ tagId: songTags.tagId }).from(songTags);
  return db.delete(tags).where(notInArray(tags.id, usedTagIds)).run().changes;
}
