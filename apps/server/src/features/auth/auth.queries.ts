import { and, asc, count, eq, gt, isNull, lte, ne, sql } from "drizzle-orm";
import type { Database } from "../../db";
import { authSessions, users } from "./auth.schema";

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type NewSessionRow = typeof authSessions.$inferInsert;

export function countUsers(db: Database): number {
  return db.select({ value: count() }).from(users).get()?.value ?? 0;
}

/** Usernames are unique whatever the case: "Pierre" and "pierre" are the same account. */
export function findUserByUsername(db: Database, username: string): UserRow | undefined {
  return db.select().from(users).where(sql`lower(${users.username}) = ${username.toLowerCase()}`).get();
}

export function findUserById(db: Database, id: string): UserRow | undefined {
  return db.select().from(users).where(eq(users.id, id)).get();
}

export function listUsers(db: Database): UserRow[] {
  return db.select().from(users).orderBy(asc(users.createdAt)).all();
}

export function updateUser(
  db: Database,
  id: string,
  patch: Partial<Pick<UserRow, "passwordHash" | "disabledAt" | "noteNaming" | "updatedAt">>,
): void {
  db.update(users).set(patch).where(eq(users.id, id)).run();
}

/** Every session of a user, but the one kept (the session that changed the password). */
export function deleteSessionsOfUser(db: Database, userId: string, keepSessionId?: string): void {
  const filter = keepSessionId
    ? and(eq(authSessions.userId, userId), ne(authSessions.id, keepSessionId))
    : eq(authSessions.userId, userId);
  db.delete(authSessions).where(filter).run();
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
      role: users.role,
      noteNaming: users.noteNaming,
    })
    .from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId))
    .where(
      and(eq(authSessions.tokenHash, tokenHash), gt(authSessions.expiresAt, now), isNull(users.disabledAt)),
    )
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
