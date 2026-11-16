import { Midi, type Track } from "@tonejs/midi";

export type Hand = "left" | "right";

export interface SongNote {
  readonly pitch: number;
  /** Song time in seconds (at 100 % speed). */
  readonly start: number;
  /** Key release: what the falling note shows. */
  readonly end: number;
  /** Sound release, extended by the sustain pedal: what the audio plays. */
  readonly soundEnd: number;
  readonly velocity: number;
  readonly hand: Hand;
}

export interface Song {
  readonly title: string;
  /** Sorted by start time. */
  readonly notes: readonly SongNote[];
  readonly duration: number;
  readonly minPitch: number;
  readonly maxPitch: number;
  readonly maxNoteDuration: number;
  readonly handMode: "tracks" | "split";
}

interface TimeRange {
  readonly start: number;
  readonly end: number;
}

const SUSTAIN_CONTROLLER = 64;
const PEDAL_DOWN_THRESHOLD = 0.5;
const SPLIT_PITCH = 60;

function collectPedalRanges(midi: Midi): TimeRange[] {
  const events = midi.tracks
    .flatMap((track) => track.controlChanges[SUSTAIN_CONTROLLER] ?? [])
    .sort((a, b) => a.time - b.time);
  const ranges: TimeRange[] = [];
  let downAt: number | undefined;
  for (const event of events) {
    const isDown = event.value >= PEDAL_DOWN_THRESHOLD;
    if (isDown && downAt === undefined) {
      downAt = event.time;
    } else if (!isDown && downAt !== undefined) {
      ranges.push({ start: downAt, end: event.time });
      downAt = undefined;
    }
  }
  if (downAt !== undefined) {
    ranges.push({ start: downAt, end: midi.duration });
  }
  return ranges;
}

function sustainedEnd(end: number, pedalRanges: readonly TimeRange[]): number {
  const range = pedalRanges.find((r) => r.start <= end && end < r.end);
  return range ? range.end : end;
}

function averagePitch(track: Track): number {
  const total = track.notes.reduce((sum, note) => sum + note.midi, 0);
  return total / track.notes.length;
}

/** With at least two note tracks, the highest one is the right hand; otherwise split by pitch. */
function pickRightHandTrack(tracks: readonly Track[]): Track | undefined {
  if (tracks.length < 2) {
    return undefined;
  }
  return [...tracks].sort((a, b) => averagePitch(b) - averagePitch(a))[0];
}

export function parseSong(data: ArrayBuffer, title: string): Song {
  const midi = new Midi(data);
  const pedalRanges = collectPedalRanges(midi);
  const noteTracks = midi.tracks.filter((track) => track.notes.length > 0 && !track.instrument.percussion);
  const rightTrack = pickRightHandTrack(noteTracks);

  const notes: SongNote[] = noteTracks.flatMap((track) =>
    track.notes.map((note) => {
      const byTrack: Hand = track === rightTrack ? "right" : "left";
      const bySplit: Hand = note.midi >= SPLIT_PITCH ? "right" : "left";
      return {
        pitch: note.midi,
        start: note.time,
        end: note.time + note.duration,
        soundEnd: sustainedEnd(note.time + note.duration, pedalRanges),
        velocity: note.velocity,
        hand: rightTrack ? byTrack : bySplit,
      };
    }),
  );
  notes.sort((a, b) => a.start - b.start || a.pitch - b.pitch);

  const pitches = notes.map((note) => note.pitch);
  return {
    title,
    notes,
    duration: Math.max(midi.duration, ...notes.map((note) => note.soundEnd)),
    minPitch: Math.min(...pitches),
    maxPitch: Math.max(...pitches),
    maxNoteDuration: Math.max(...notes.map((note) => note.end - note.start)),
    handMode: rightTrack ? "tracks" : "split",
  };
}

/** Index of the first note whose start is >= time (binary search). */
export function firstNoteAtOrAfter(notes: readonly SongNote[], time: number): number {
  let low = 0;
  let high = notes.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    const note = notes[mid];
    if (note !== undefined && note.start < time) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}
