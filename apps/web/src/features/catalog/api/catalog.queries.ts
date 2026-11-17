import type { SongSummary, UpdateSongRequest } from "@open-keys/contracts";
import { keepPreviousData, queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { midiCache, useIsOnline } from "../../../shared/offline";
import { libraryQuery } from "../../library";
import type { CatalogSearch } from "../catalog-search";
import { offlineCatalog } from "../offline-catalog";
import { deleteSong, getSong, listSongs, listTags, updateSong } from "./catalog.api";

const LIST_GC_TIME_MS = 5 * 60_000;

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
    // One entry per search: not kept for offline use (shared/offline/query-persistence.ts).
    gcTime: LIST_GC_TIME_MS,
  });

export const songQuery = (id: string) =>
  queryOptions({ queryKey: songKeys.detail(id), queryFn: () => getSong(id) });

export const tagsQuery = queryOptions({ queryKey: ["tags"] as const, queryFn: listTags });

export function useSongs(search: CatalogSearch) {
  return useQuery(songsQuery(search));
}

export interface CatalogSongs {
  readonly data: SongSummary[] | undefined;
  readonly error: Error | null;
  /** Offline: only the songs stored on the device are listed. */
  readonly offline: boolean;
}

/** The catalogue from the API, or offline the songs playable on this device (UC-14). */
export function useCatalogSongs(search: CatalogSearch): CatalogSongs {
  const online = useIsOnline();
  const remote = useSongs(search);
  const stored = useQuery({
    queryKey: ["device", "songs"] as const,
    queryFn: () => midiCache.songs(),
    enabled: !online,
    networkMode: "always",
    staleTime: 0,
  });
  const library = useQuery(libraryQuery);
  if (online) {
    return { data: remote.data, error: remote.error, offline: false };
  }
  return {
    data: stored.data && offlineCatalog(stored.data, library.data ?? [], search),
    error: stored.error,
    offline: true,
  };
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
