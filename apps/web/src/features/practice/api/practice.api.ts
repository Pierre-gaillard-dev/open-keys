import {
  type Loop,
  loopSchema,
  type PracticeSession,
  type PracticeStats,
  type PutLoopRequest,
  type PutPracticeSessionRequest,
  practiceSessionSchema,
  practiceStatsSchema,
} from "@open-keys/contracts";
import { z } from "zod";
import { apiRequest } from "../../../shared/api";

export function fetchPracticeStats(songId: string): Promise<PracticeStats> {
  return apiRequest("GET", `/songs/${songId}/practice-stats`, { schema: practiceStatsSchema });
}

export function listLoops(songId: string): Promise<Loop[]> {
  return apiRequest("GET", `/songs/${songId}/loops`, { schema: z.array(loopSchema) });
}

export function putLoop(id: string, loop: PutLoopRequest): Promise<Loop> {
  return apiRequest("PUT", `/loops/${id}`, { body: loop, schema: loopSchema });
}

/** Idempotent: the same session id is sent again as the session grows (last write wins). */
export function putPracticeSession(
  id: string,
  session: PutPracticeSessionRequest,
  options: { keepalive?: boolean } = {},
): Promise<PracticeSession> {
  return apiRequest("PUT", `/practice-sessions/${id}`, {
    body: session,
    schema: practiceSessionSchema,
    ...(options.keepalive ? { keepalive: true } : {}),
  });
}

export function deleteLoop(id: string): Promise<void> {
  return apiRequest("DELETE", `/loops/${id}`);
}
