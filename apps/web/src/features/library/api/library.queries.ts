import { DEFAULT_HANDS_SETTINGS, type LibraryEntry, type PutLibraryEntryRequest } from "@open-keys/contracts";
import { type QueryClient, queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listLibrary, putLibraryEntry } from "./library.api";

export const libraryQuery = queryOptions({
  queryKey: ["library"] as const,
  queryFn: listLibrary,
});

/** Personal state of one song, or null if the user never touched it. */
export function useLibraryEntry(songId: string) {
  return useQuery({
    ...libraryQuery,
    select: (entries) => entries.find((entry) => entry.songId === songId) ?? null,
  });
}

export type LibraryPatch = Partial<Omit<PutLibraryEntryRequest, "updatedAt">>;

function nextEntry(current: LibraryEntry | undefined, patch: LibraryPatch, songId: string): LibraryEntry {
  return {
    songId,
    status: "to_learn",
    isFavorite: false,
    lastPositionMs: 0,
    lastTempoPct: 100,
    handsSettings: DEFAULT_HANDS_SETTINGS,
    lastLoopId: null,
    lastPracticedAt: null,
    ...current,
    ...patch,
    // Last-write-wins on the server: the client clock dates the change.
    updatedAt: Date.now(),
  };
}

/**
 * Saves a patch outside of React (player exit): merged with the cached entry, cached immediately,
 * sent with keepalive so it survives the page being closed.
 */
export async function saveLibraryPatch(
  queryClient: QueryClient,
  songId: string,
  patch: LibraryPatch,
): Promise<void> {
  const entries = queryClient.getQueryData(libraryQuery.queryKey) ?? [];
  const next = nextEntry(
    entries.find((entry) => entry.songId === songId),
    patch,
    songId,
  );
  queryClient.setQueryData(libraryQuery.queryKey, [
    ...entries.filter((entry) => entry.songId !== songId),
    next,
  ]);
  const { songId: _songId, ...body } = next;
  await putLibraryEntry(songId, body, { keepalive: true });
  void queryClient.invalidateQueries({ queryKey: ["songs"] });
}

/** Status and favorite changes, applied optimistically then confirmed by the server. */
export function useUpdateLibraryEntry(songId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: LibraryPatch) => {
      const current = queryClient
        .getQueryData(libraryQuery.queryKey)
        ?.find((entry) => entry.songId === songId);
      const { songId: _songId, ...body } = nextEntry(current, patch, songId);
      return putLibraryEntry(songId, body);
    },
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: libraryQuery.queryKey });
      const previous = queryClient.getQueryData(libraryQuery.queryKey);
      queryClient.setQueryData(libraryQuery.queryKey, (entries = []) => {
        const current = entries.find((entry) => entry.songId === songId);
        return [...entries.filter((entry) => entry.songId !== songId), nextEntry(current, patch, songId)];
      });
      return { previous };
    },
    onError: (_error, _patch, context) => {
      queryClient.setQueryData(libraryQuery.queryKey, context?.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: libraryQuery.queryKey });
      // Lists filter and sort on this state.
      void queryClient.invalidateQueries({ queryKey: ["songs"] });
    },
  });
}
