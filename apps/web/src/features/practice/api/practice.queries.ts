import type { PutLoopRequest } from "@open-keys/contracts";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteLoop, fetchPracticeStats, listLoops, putLoop } from "./practice.api";

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

export function useSaveLoop(songId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, loop }: { id: string; loop: PutLoopRequest }) => putLoop(id, loop),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: loopsQuery(songId).queryKey }),
  });
}

export function useDeleteLoop(songId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteLoop,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: loopsQuery(songId).queryKey }),
  });
}
