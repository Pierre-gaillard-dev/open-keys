import { and, asc, count, desc, eq, inArray, lt } from "drizzle-orm";
import type { Database } from "../../db";
import { transcriptionJobs } from "./transcriptions.schema";

export type TranscriptionJobRow = typeof transcriptionJobs.$inferSelect;

export function insertJob(db: Database, job: TranscriptionJobRow): void {
  db.insert(transcriptionJobs).values(job).run();
}

export function updateJob(db: Database, id: string, patch: Partial<TranscriptionJobRow>): void {
  db.update(transcriptionJobs).set(patch).where(eq(transcriptionJobs.id, id)).run();
}

export function findJob(db: Database, id: string): TranscriptionJobRow | undefined {
  return db.select().from(transcriptionJobs).where(eq(transcriptionJobs.id, id)).get();
}

export function listJobsOfUser(db: Database, userId: string, limit: number): TranscriptionJobRow[] {
  return db
    .select()
    .from(transcriptionJobs)
    .where(eq(transcriptionJobs.userId, userId))
    .orderBy(desc(transcriptionJobs.createdAt))
    .limit(limit)
    .all();
}

/** Queued jobs, oldest first: the order they are transcribed in. */
export function listQueued(db: Database): TranscriptionJobRow[] {
  return db
    .select()
    .from(transcriptionJobs)
    .where(eq(transcriptionJobs.status, "queued"))
    .orderBy(asc(transcriptionJobs.createdAt), asc(transcriptionJobs.id))
    .all();
}

export function countPendingOfUser(db: Database, userId: string): number {
  return (
    db
      .select({ n: count() })
      .from(transcriptionJobs)
      .where(
        and(eq(transcriptionJobs.userId, userId), inArray(transcriptionJobs.status, ["queued", "running"])),
      )
      .get()?.n ?? 0
  );
}

/** Jobs left running by a stop of the server: queued again. */
export function requeueRunning(db: Database): number {
  return db
    .update(transcriptionJobs)
    .set({ status: "queued", startedAt: null })
    .where(eq(transcriptionJobs.status, "running"))
    .run().changes;
}

/** Finished jobs older than `before`: forgotten (their draft song stays). */
export function deleteFinishedBefore(db: Database, before: number): number {
  return db
    .delete(transcriptionJobs)
    .where(
      and(inArray(transcriptionJobs.status, ["done", "failed"]), lt(transcriptionJobs.finishedAt, before)),
    )
    .run().changes;
}
