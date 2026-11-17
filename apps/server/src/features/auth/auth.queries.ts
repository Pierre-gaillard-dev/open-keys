import { and, count, eq, gt, lte } from "drizzle-orm";
import type { Database } from "../../db";
import { authSessions, users } from "./auth.schema";

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type NewSessionRow = typeof authSessions.$inferInsert;

export function countUsers(db: Database): number {
  return db.select({ value: count() }).from(users).get()?.value ?? 0;
}

export function findUserByUsername(db: Database, username: string): UserRow | undefined {
  return db.select().from(users).where(eq(users.username, username)).get();
}

export function insertUser(db: Database, user: NewUserRow): void {
  db.insert(users).values(user).run();
}

export function insertSession(db: Database, session: NewSessionRow): void {
  db.insert(authSessions).values(session).run();
}

export function findActiveSession(db: Database, tokenHash: string, now: number) {
  return db
    .select({
      sessionId: authSessions.id,
      expiresAt: authSessions.expiresAt,
      userId: users.id,
      username: users.username,
    })
    .from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId))
    .where(and(eq(authSessions.tokenHash, tokenHash), gt(authSessions.expiresAt, now)))
    .get();
}

export function updateSessionExpiry(db: Database, sessionId: string, expiresAt: number): void {
  db.update(authSessions).set({ expiresAt }).where(eq(authSessions.id, sessionId)).run();
}

export function deleteSessionByTokenHash(db: Database, tokenHash: string): void {
  db.delete(authSessions).where(eq(authSessions.tokenHash, tokenHash)).run();
}

export function deleteExpiredSessions(db: Database, now: number): number {
  return db.delete(authSessions).where(lte(authSessions.expiresAt, now)).run().changes;
}
