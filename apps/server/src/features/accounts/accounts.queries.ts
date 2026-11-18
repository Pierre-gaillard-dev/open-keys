import { and, desc, eq, gt, isNull, lte, or } from "drizzle-orm";
import type { Database } from "../../db";
import { invitations } from "./accounts.schema";

export type InvitationRow = typeof invitations.$inferSelect;

export function insertInvitation(db: Database, invitation: InvitationRow): void {
  db.insert(invitations).values(invitation).run();
}

/** Not used, not expired. */
export function findValidInvitation(db: Database, tokenHash: string, now: number): InvitationRow | undefined {
  return db
    .select()
    .from(invitations)
    .where(
      and(eq(invitations.tokenHash, tokenHash), isNull(invitations.usedAt), gt(invitations.expiresAt, now)),
    )
    .get();
}

export function listPendingInvitations(db: Database, now: number): InvitationRow[] {
  return db
    .select()
    .from(invitations)
    .where(and(isNull(invitations.usedAt), gt(invitations.expiresAt, now)))
    .orderBy(desc(invitations.createdAt))
    .all();
}

/** Marks the link used, unless another request used it first: true when this one won. */
export function useInvitation(db: Database, id: string, now: number): boolean {
  return (
    db
      .update(invitations)
      .set({ usedAt: now })
      .where(and(eq(invitations.id, id), isNull(invitations.usedAt)))
      .run().changes === 1
  );
}

export function deleteInvitation(db: Database, id: string): number {
  return db.delete(invitations).where(eq(invitations.id, id)).run().changes;
}

/** Used or expired links: nothing left to show. */
export function deleteStaleInvitations(db: Database, now: number): number {
  return db
    .delete(invitations)
    .where(or(lte(invitations.expiresAt, now), gt(invitations.usedAt, 0)))
    .run().changes;
}
