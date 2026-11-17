import type { Loop, PutLoopRequest } from "@open-keys/contracts";
import { type QueryClient, queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchPracticeStats, listLoops, putLoop } from "./practice.api";

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

/** Loops of the song in the cache, with `loop` added, replaced or (soft-deleted) removed. */
function cacheLoop(queryClient: QueryClient, loop: Loop): void {
  queryClient.setQueryData(loopsQuery(loop.songId).queryKey, (loops = []) => {
    const others = loops.filter((existing) => existing.id !== loop.id);
    return loop.deletedAt === null ? [...others, loop] : others;
  });
}

/** Applied at once in the cache (works offline), synchronised in the background. */
export function useSaveLoop() {
  const queryClient = useQueryClient();
  return useMutation({
    networkMode: "always",
    mutationFn: async ({ id, loop }: { id: string; loop: PutLoopRequest }) => {
      cacheLoop(queryClient, { ...loop, id });
      await putLoop(id, loop);
    },
  });
}

export function useDeleteLoop(songId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    networkMode: "always",
    mutationFn: async (id: string) => {
      const loop = queryClient.getQueryData(loopsQuery(songId).queryKey)?.find((saved) => saved.id === id);
      if (!loop) {
        return;
      }
      const now = Date.now();
      const { id: _id, ...fields } = loop;
      cacheLoop(queryClient, { ...loop, deletedAt: now, updatedAt: now });
      await putLoop(id, { ...fields, deletedAt: now, updatedAt: now });
    },
  });
}
