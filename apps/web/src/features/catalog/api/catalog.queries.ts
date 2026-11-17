import type { UpdateSongRequest } from "@open-keys/contracts";
import { keepPreviousData, queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CatalogSearch } from "../catalog-search";
import { deleteSong, getSong, listSongs, listTags, updateSong } from "./catalog.api";

/** Every song-related key starts with "songs": invalidating it refreshes lists and details. */
export const songKeys = {
  all: ["songs"] as const,
  list: (search: CatalogSearch) => ["songs", "list", search] as const,
  detail: (id: string) => ["songs", id, "detail"] as const,
};

export const songsQuery = (search: CatalogSearch) =>
  queryOptions({
    queryKey: songKeys.list(search),
    queryFn: ({ signal }) => listSongs(search, signal),
    // Keep the previous grid while a new search loads (no flash of empty state).
    placeholderData: keepPreviousData,
  });

export const songQuery = (id: string) =>
  queryOptions({ queryKey: songKeys.detail(id), queryFn: () => getSong(id) });

export const tagsQuery = queryOptions({ queryKey: ["tags"] as const, queryFn: listTags });

export function useSongs(search: CatalogSearch) {
  return useQuery(songsQuery(search));
}

export function useSong(id: string) {
  return useQuery(songQuery(id));
}

export function useTags() {
  return useQuery(tagsQuery);
}

export function useUpdateSong(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (changes: UpdateSongRequest) => updateSong(id, changes),
    onSuccess: (song) => {
      queryClient.setQueryData(songKeys.detail(id), song);
      void queryClient.invalidateQueries({ queryKey: songKeys.all });
      void queryClient.invalidateQueries({ queryKey: tagsQuery.queryKey });
    },
  });
}

export function useDeleteSong(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => deleteSong(id),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: songKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: songKeys.all });
      void queryClient.invalidateQueries({ queryKey: tagsQuery.queryKey });
    },
  });
}
