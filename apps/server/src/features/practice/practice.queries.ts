import { and, asc, count, eq, isNull, max, sql, sum } from "drizzle-orm";
import type { Executor } from "../../db";
import { loops, practiceSessions } from "./practice.schema";

export type LoopRow = typeof loops.$inferSelect;
export type NewLoopRow = typeof loops.$inferInsert;
export type PracticeSessionRow = typeof practiceSessions.$inferSelect;
export type NewPracticeSessionRow = typeof practiceSessions.$inferInsert;

export function findLoop(db: Executor, id: string): LoopRow | undefined {
  return db.select().from(loops).where(eq(loops.id, id)).get();
}

export function listActiveLoops(db: Executor, userId: string, songId: string): LoopRow[] {
  return db
    .select()
    .from(loops)
    .where(and(eq(loops.userId, userId), eq(loops.songId, songId), isNull(loops.deletedAt)))
    .orderBy(asc(loops.startMs))
    .all();
}

/** Last-write-wins upsert: an older updatedAt never overwrites a newer row. */
export function upsertLoop(db: Executor, loop: NewLoopRow): void {
  const { id: _id, userId: _userId, ...changes } = loop;
  db.insert(loops)
    .values(loop)
    .onConflictDoUpdate({
      target: loops.id,
      set: changes,
      setWhere: sql`${loops.updatedAt} <= excluded.updated_at`,
    })
    .run();
}

export function findPracticeSession(db: Executor, id: string): PracticeSessionRow | undefined {
  return db.select().from(practiceSessions).where(eq(practiceSessions.id, id)).get();
}

export function upsertPracticeSession(db: Executor, session: NewPracticeSessionRow): void {
  const { id: _id, userId: _userId, ...changes } = session;
  db.insert(practiceSessions)
    .values(session)
    .onConflictDoUpdate({
      target: practiceSessions.id,
      set: changes,
      setWhere: sql`${practiceSessions.updatedAt} <= excluded.updated_at`,
    })
    .run();
}

export function practiceTotals(db: Executor, userId: string, songId: string) {
  return db
    .select({
      totalActiveMs: sum(practiceSessions.activeMs).mapWith(Number),
      sessionCount: count(),
      lastPracticedAt: max(practiceSessions.endedAt),
    })
    .from(practiceSessions)
    .where(and(eq(practiceSessions.userId, userId), eq(practiceSessions.songId, songId)))
    .get();
}
