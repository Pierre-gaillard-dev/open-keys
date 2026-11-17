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
 * Applies a patch locally (cache, kept for offline use) and queues it for the server: works the same
 * online and offline (UC-12, UC-15). The server keeps the latest write (updatedAt).
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
  await putLibraryEntry(songId, body);
}

/** Status and favorite changes: applied at once, synchronised in the background. */
export function useUpdateLibraryEntry(songId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: LibraryPatch) => saveLibraryPatch(queryClient, songId, patch),
    networkMode: "always",
  });
}
