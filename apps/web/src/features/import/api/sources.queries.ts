import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { songKeys } from "../../catalog";
import { importSourcePiece, type SourcesSearch, searchSources } from "./sources.api";

export function useSourcesSearch(search: SourcesSearch) {
  return useQuery({
    queryKey: ["sources", "search", search] as const,
    queryFn: ({ signal }) => searchSources(search, signal),
    // Keep the previous results while typing (no flash of empty list).
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  });
}

export function useImportSourcePiece() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: importSourcePiece,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: songKeys.all }),
  });
}
