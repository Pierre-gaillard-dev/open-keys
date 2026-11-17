import {
  type Loop,
  loopSchema,
  type PracticeStats,
  type PutLoopRequest,
  type PutPracticeSessionRequest,
  practiceStatsSchema,
} from "@open-keys/contracts";
import { z } from "zod";
import { apiRequest } from "../../../shared/api";
import { outbox } from "../../../shared/offline";

export function fetchPracticeStats(songId: string): Promise<PracticeStats> {
  return apiRequest("GET", `/songs/${songId}/practice-stats`, { schema: practiceStatsSchema });
}

export function listLoops(songId: string): Promise<Loop[]> {
  return apiRequest("GET", `/songs/${songId}/loops`, { schema: z.array(loopSchema) });
}

/*
 * Writes go through the outbox (UC-15): sent now if possible, otherwise when the network comes back.
 * Every write is an idempotent PUT; a loop is deleted with deletedAt (soft delete, last write wins).
 */

export function putLoop(id: string, loop: PutLoopRequest): Promise<void> {
  return outbox.put(`/loops/${id}`, loop);
}

/** The same session id is sent again as the session grows. */
export function putPracticeSession(id: string, session: PutPracticeSessionRequest): Promise<void> {
  return outbox.put(`/practice-sessions/${id}`, session);
}
