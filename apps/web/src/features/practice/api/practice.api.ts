import { type Loop, loopSchema, type PracticeStats, practiceStatsSchema } from "@open-keys/contracts";
import { z } from "zod";
import { apiRequest } from "../../../shared/api";

export function fetchPracticeStats(songId: string): Promise<PracticeStats> {
  return apiRequest("GET", `/songs/${songId}/practice-stats`, { schema: practiceStatsSchema });
}

export function listLoops(songId: string): Promise<Loop[]> {
  return apiRequest("GET", `/songs/${songId}/loops`, { schema: z.array(loopSchema) });
}
