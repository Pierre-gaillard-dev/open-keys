import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { songKeys } from "../../catalog";
import { importMutopiaPiece, searchMutopia } from "./mutopia.api";

export const mutopiaKeys = {
  search: (q: string, solo: boolean) => ["mutopia", "search", q, solo] as const,
};

export function useMutopiaSearch(q: string, solo: boolean) {
  return useQuery({
    queryKey: mutopiaKeys.search(q, solo),
    queryFn: ({ signal }) => searchMutopia(q, solo, signal),
    // Keep the previous results while typing (no flash of empty list).
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  });
}

export function useImportMutopiaPiece() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: importMutopiaPiece,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: songKeys.all }),
  });
}
