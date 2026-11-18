import type { ConfirmImportRequest, SetCoverRequest, SongDetail } from "@open-keys/contracts";
import { type ParsedNote, parseMidiNotes } from "@open-keys/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiBytes } from "../../../shared/api";
import { songKeys, tagsQuery } from "../../catalog";
import {
  confirmImport,
  fetchCoverSuggestions,
  importFile,
  importUrl,
  removeCover,
  setCover,
  uploadCover,
} from "./import.api";

/**
 * Notes of a song, for the hand editor (D28). Not kept on the device: drafts are temporary, and the
 * player caches the file of the songs it opens.
 */
export function useSongNotes(song: Pick<SongDetail, "id" | "midiUrl">) {
  return useQuery({
    queryKey: ["songs", song.id, "notes"] as const,
    queryFn: async (): Promise<readonly ParsedNote[]> => parseMidiNotes(await apiBytes(song.midiUrl)).notes,
    // The file of a song never changes.
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 5 * 60_000,
  });
}

export function useImportFile() {
  return useMutation({ mutationFn: importFile });
}

export function useImportUrl() {
  return useMutation({ mutationFn: importUrl });
}

export function useConfirmImport(songId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: ConfirmImportRequest) => confirmImport(songId, request),
    onSuccess: (song) => {
      queryClient.setQueryData(songKeys.detail(songId), song);
      void queryClient.invalidateQueries({ queryKey: songKeys.all });
      void queryClient.invalidateQueries({ queryKey: tagsQuery.queryKey });
    },
  });
}

/** Suggestions are searched on demand (external APIs, a few seconds). */
export function useCoverSuggestions(songId: string, title: string, composer: string, enabled: boolean) {
  return useQuery({
    queryKey: ["songs", songId, "cover-suggestions", title, composer] as const,
    queryFn: () => fetchCoverSuggestions(songId, title, composer),
    enabled: enabled && title.trim().length > 0,
    staleTime: 30 * 60_000,
  });
}

type CoverChange =
  | { readonly kind: "set"; readonly request: SetCoverRequest }
  | { readonly kind: "upload"; readonly file: File }
  | { readonly kind: "remove" };

export function useChangeCover(songId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (change: CoverChange) => {
      switch (change.kind) {
        case "set":
          return setCover(songId, change.request);
        case "upload":
          return uploadCover(songId, change.file);
        default:
          return removeCover(songId);
      }
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: songKeys.all }),
  });
}
