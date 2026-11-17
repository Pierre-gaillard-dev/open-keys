import { and, eq, sql } from "drizzle-orm";
import type { Executor } from "../../db";
import { userSongs } from "./library.schema";

export type LibraryRow = typeof userSongs.$inferSelect;
export type NewLibraryRow = typeof userSongs.$inferInsert;

export function findLibraryEntry(db: Executor, userId: string, songId: string): LibraryRow | undefined {
  return db
    .select()
    .from(userSongs)
    .where(and(eq(userSongs.userId, userId), eq(userSongs.songId, songId)))
    .get();
}

export function listLibraryEntries(db: Executor, userId: string): LibraryRow[] {
  return db.select().from(userSongs).where(eq(userSongs.userId, userId)).all();
}

/** Last-write-wins upsert: an older updatedAt never overwrites a newer row. */
export function upsertLibraryEntry(db: Executor, entry: NewLibraryRow): void {
  const { userId: _userId, songId: _songId, ...changes } = entry;
  db.insert(userSongs)
    .values(entry)
    .onConflictDoUpdate({
      target: [userSongs.userId, userSongs.songId],
      set: changes,
      setWhere: sql`${userSongs.updatedAt} <= excluded.updated_at`,
    })
    .run();
}
