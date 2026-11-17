import type { Cover, SongDetail, SongSummary } from "@open-keys/contracts";
import type { LibrarySummaryRow, SongRow, SongTrackRow } from "./songs.queries";

export function coverOf(song: SongRow): Cover | null {
  if (!(song.coverSha256 && song.coverSource)) {
    return null;
  }
  return {
    url: `/api/songs/${song.id}/cover?v=${song.coverSha256.slice(0, 16)}`,
    source: song.coverSource,
    credit: song.coverCredit,
  };
}

export function toSongSummary(
  song: SongRow,
  tags: readonly string[],
  library: LibrarySummaryRow | null,
): SongSummary {
  return {
    id: song.id,
    title: song.title,
    composer: song.composer,
    difficulty: song.difficulty,
    durationMs: song.durationMs,
    noteCount: song.noteCount,
    minPitch: song.minPitch,
    maxPitch: song.maxPitch,
    tags: [...tags],
    cover: coverOf(song),
    library,
    createdAt: song.createdAt,
  };
}

export function toSongDetail(
  song: SongRow,
  tracks: readonly SongTrackRow[],
  tags: readonly string[],
  library: LibrarySummaryRow | null,
): SongDetail {
  return {
    ...toSongSummary(song, tags, library),
    state: song.state,
    sourceType: song.sourceType,
    sourceUrl: song.sourceUrl,
    license: song.license,
    handMode: song.handMode,
    splitPitch: song.splitPitch,
    tracks: tracks.map((track) => ({
      id: track.id,
      trackIndex: track.trackIndex,
      channel: track.channel,
      name: track.name,
      instrument: track.instrument,
      noteCount: track.noteCount,
      minPitch: track.minPitch,
      maxPitch: track.maxPitch,
      hand: track.hand,
    })),
    midiUrl: `/api/songs/${song.id}/midi`,
    updatedAt: song.updatedAt,
  };
}
