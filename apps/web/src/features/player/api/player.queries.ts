import type { SongDetail } from "@open-keys/contracts";
import { buildTimeline, parseMidiNotes, type Timeline } from "@open-keys/core";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "../../../shared/api";

async function fetchMidi(url: string): Promise<Uint8Array> {
  let response: Response;
  try {
    response = await fetch(url, { credentials: "same-origin" });
  } catch {
    throw new ApiError(0, "INTERNAL_ERROR", "The server cannot be reached. Check your connection.");
  }
  if (!response.ok) {
    throw new ApiError(
      response.status,
      response.status === 404 ? "NOT_FOUND" : "INTERNAL_ERROR",
      "MIDI file unavailable",
    );
  }
  return new Uint8Array(await response.arrayBuffer());
}

/** Notes of the song with its hand assignment, ready for the engine (parsed once, cached). */
export function useTimeline(song: SongDetail | undefined) {
  return useQuery({
    queryKey: ["songs", song?.id, "timeline", song?.updatedAt] as const,
    enabled: song !== undefined,
    // The file never changes (content-addressed); the hand mapping is part of the key via updatedAt.
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: async (): Promise<Timeline> => {
      if (!song) {
        throw new Error("No song");
      }
      const parsed = parseMidiNotes(await fetchMidi(song.midiUrl));
      return buildTimeline(parsed, {
        mode: song.handMode,
        splitPitch: song.splitPitch,
        tracks: song.tracks.map((track) => ({ trackIndex: track.trackIndex, hand: track.hand })),
      });
    },
  });
}
