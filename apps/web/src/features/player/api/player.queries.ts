import type { SongDetail } from "@open-keys/contracts";
import { buildTimeline, parseMidiNotes, type Timeline } from "@open-keys/core";
import { useQuery } from "@tanstack/react-query";
import { isNetworkError } from "../../../shared/api";
import { midiCache } from "../../../shared/offline";

const MAX_RETRIES = 2;

/** Parsed timelines are large: dropped soon after leaving the player (the MIDI stays on the device). */
const TIMELINE_GC_TIME_MS = 5 * 60_000;

/**
 * Notes of the song with its hand assignment, ready for the engine. The MIDI comes from the device
 * when it was already opened (works offline), otherwise from the API, and is kept for next time.
 */
export function useTimeline(song: SongDetail | undefined) {
  return useQuery({
    // Own root: refreshing the "songs" data never rebuilds the player of the song being played.
    queryKey: ["timelines", song?.id, song?.updatedAt] as const,
    enabled: song !== undefined,
    // The file never changes (content-addressed); the hand mapping is part of the key via updatedAt.
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: TIMELINE_GC_TIME_MS,
    // Read from IndexedDB first: must also run offline.
    networkMode: "always",
    // Offline with a file never downloaded: say so at once instead of retrying.
    retry: (failureCount, error) => failureCount < MAX_RETRIES && !isNetworkError(error),
    queryFn: async (): Promise<Timeline> => {
      if (!song) {
        throw new Error("No song");
      }
      const parsed = parseMidiNotes(await midiCache.get(song));
      return buildTimeline(parsed, {
        mode: song.handMode,
        splitPitch: song.splitPitch,
        tracks: song.tracks.map((track) => ({ trackIndex: track.trackIndex, hand: track.hand })),
      });
    },
  });
}
