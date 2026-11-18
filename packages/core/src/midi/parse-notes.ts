import { hasMidiHeader, InvalidMidiError } from "./analyze-midi";
import { type Beat, beatGrid } from "./beat-grid";
import type { Midi } from "./tonejs-midi";
import { Midi as MidiParser } from "./tonejs-midi";

export interface ParsedNote {
  readonly trackIndex: number;
  readonly pitch: number;
  /** Position in the file's own time unit: with the track and the pitch, identifies the note. */
  readonly ticks: number;
  /** Seconds at 100 % speed. */
  readonly start: number;
  /** Key release: what a falling note shows. */
  readonly end: number;
  /** Sound release, extended by the sustain pedal: what the audio plays. */
  readonly soundEnd: number;
  /** 0–1 */
  readonly velocity: number;
}

export interface ParsedNotes {
  readonly durationS: number;
  /** Sorted by start, then pitch. */
  readonly notes: readonly ParsedNote[];
  /** Metronome grid (tempo map and time signatures of the file). */
  readonly beats: readonly Beat[];
}

interface TimeRange {
  readonly start: number;
  readonly end: number;
}

const SUSTAIN_CONTROLLER = 64;
const PEDAL_DOWN_THRESHOLD = 0.5;

/** Periods during which the sustain pedal (CC64) is down, across all tracks. */
function pedalRanges(midi: Midi): TimeRange[] {
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
    ranges.push({ start: downAt, end: Math.max(midi.duration, downAt) });
  }
  return ranges;
}

function sustainedEnd(end: number, ranges: readonly TimeRange[]): number {
  const range = ranges.find((candidate) => candidate.start <= end && end < candidate.end);
  return range ? range.end : end;
}

/** Every note of a MIDI file, with the pedal applied to the sound only (validated by the spike, D17). */
export function parseMidiNotes(bytes: Uint8Array): ParsedNotes {
  if (!hasMidiHeader(bytes)) {
    throw new InvalidMidiError("Not a MIDI file (missing MThd header)");
  }
  let midi: Midi;
  try {
    midi = new MidiParser(bytes);
  } catch (cause) {
    throw new InvalidMidiError("Unreadable MIDI file", { cause });
  }
  const ranges = pedalRanges(midi);
  const notes: ParsedNote[] = midi.tracks.flatMap((track, trackIndex) =>
    track.notes.map((note) => {
      const end = note.time + note.duration;
      return {
        trackIndex,
        pitch: note.midi,
        ticks: note.ticks,
        start: note.time,
        end,
        soundEnd: sustainedEnd(end, ranges),
        velocity: note.velocity,
      };
    }),
  );
  notes.sort((a, b) => a.start - b.start || a.pitch - b.pitch);
  const lastSound = notes.reduce((max, note) => Math.max(max, note.soundEnd), 0);
  return { durationS: Math.max(midi.duration, lastSound), notes, beats: beatGrid(midi) };
}
