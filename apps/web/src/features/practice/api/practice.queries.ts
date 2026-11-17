import { queryOptions, useQuery } from "@tanstack/react-query";
import { fetchPracticeStats, listLoops } from "./practice.api";

export const practiceStatsQuery = (songId: string) =>
  queryOptions({
    queryKey: ["songs", songId, "practice-stats"] as const,
    queryFn: () => fetchPracticeStats(songId),
  });

export const loopsQuery = (songId: string) =>
  queryOptions({ queryKey: ["songs", songId, "loops"] as const, queryFn: () => listLoops(songId) });

export function usePracticeStats(songId: string) {
  return useQuery(practiceStatsQuery(songId));
}

export function useLoops(songId: string) {
  return useQuery(loopsQuery(songId));
}
