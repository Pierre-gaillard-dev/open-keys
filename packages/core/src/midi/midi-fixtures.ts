import { Midi } from "./tonejs-midi";

export interface FixtureNote {
  readonly pitch: number;
  readonly time: number;
  readonly duration: number;
}

export interface FixtureTrack {
  readonly name?: string;
  readonly channel?: number;
  readonly percussion?: boolean;
  readonly notes: readonly FixtureNote[];
}

export interface FixtureMeter {
  readonly bpm?: number;
  /** [beats in a bar, beat unit], e.g. [3, 4]. */
  readonly timeSignature?: readonly [number, number];
}

/** Builds a MIDI file in memory (test helper, no binary fixtures in the repo). */
export function buildMidi(tracks: readonly FixtureTrack[], title = "", meter: FixtureMeter = {}): Uint8Array {
  const midi = new Midi();
  midi.header.name = title;
  if (meter.bpm !== undefined) {
    midi.header.setTempo(meter.bpm);
  }
  if (meter.timeSignature) {
    midi.header.timeSignatures.push({ ticks: 0, timeSignature: [...meter.timeSignature] });
  }
  for (const spec of tracks) {
    const track = midi.addTrack();
    track.name = spec.name ?? "";
    track.channel = spec.channel ?? 0;
    if (spec.percussion) {
      track.instrument.number = 0;
      track.channel = 9;
    }
    for (const note of spec.notes) {
      track.addNote({ midi: note.pitch, time: note.time, duration: note.duration });
    }
  }
  return midi.toArray();
}

/** Ascending notes, one per half second. */
export function scale(from: number, count: number, start = 0): FixtureNote[] {
  return Array.from({ length: count }, (_, i) => ({ pitch: from + i, time: start + i * 0.5, duration: 0.5 }));
}
