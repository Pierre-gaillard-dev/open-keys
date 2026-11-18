import type { MidiTrackSummary } from "../midi";
import type { Hand, HandMapping, TrackHand } from "./hands.types";

/** Middle C (C4). */
export const DEFAULT_SPLIT_PITCH = 60;

/** General MIDI programs 0 to 7, as @tonejs/midi names them (a track without program change is the first). */
const PIANO_FAMILY: ReadonlySet<string> = new Set([
  "acoustic grand piano",
  "bright acoustic piano",
  "electric grand piano",
  "honky-tonk piano",
  "electric piano 1",
  "electric piano 2",
  "harpsichord",
  "clavi",
]);

const isPiano = (track: MidiTrackSummary) => PIANO_FAMILY.has(track.instrument?.toLowerCase() ?? "");

/**
 * Initial proposal shown on the import review screen (UC-04):
 * - percussion is ignored, and so are the other instruments of a band arrangement when it has piano
 *   tracks (guitar, bass…: not for the hands; the accompaniment comes with V1.4);
 * - two or more playable tracks: the highest one (average pitch) is the right hand, the others the left;
 * - a single playable track: split by pitch at C4.
 */
export function suggestHandMapping(tracks: readonly MidiTrackSummary[]): HandMapping {
  const melodic = tracks.filter((track) => !track.isPercussion);
  const pianos = melodic.filter(isPiano);
  const playable = pianos.length > 0 ? pianos : melodic;
  const highest = playable.reduce<MidiTrackSummary | undefined>(
    (best, track) => (best === undefined || track.averagePitch > best.averagePitch ? track : best),
    undefined,
  );
  const mode = playable.length >= 2 ? "tracks" : "split";
  const handOf = (track: MidiTrackSummary): TrackHand => {
    if (!playable.includes(track)) {
      return "ignore";
    }
    if (mode === "split") {
      return track.averagePitch >= DEFAULT_SPLIT_PITCH ? "right" : "left";
    }
    return track === highest ? "right" : "left";
  };
  return {
    mode,
    splitPitch: DEFAULT_SPLIT_PITCH,
    tracks: tracks.map((track) => ({ trackIndex: track.index, hand: handOf(track) })),
  };
}

/** Hand that plays a given note, or undefined when its track is ignored. */
export function handForNote(mapping: HandMapping, trackIndex: number, pitch: number): Hand | undefined {
  const trackHand = mapping.tracks.find((track) => track.trackIndex === trackIndex)?.hand ?? "ignore";
  if (trackHand === "ignore") {
    return undefined;
  }
  if (mapping.mode === "split") {
    return pitch >= mapping.splitPitch ? "right" : "left";
  }
  return trackHand;
}
