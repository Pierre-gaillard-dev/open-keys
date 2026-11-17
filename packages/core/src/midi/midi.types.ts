export interface MidiTrackSummary {
  /** Index of the track in the MIDI file. */
  readonly index: number;
  readonly channel: number;
  readonly name: string | null;
  readonly instrument: string | null;
  readonly isPercussion: boolean;
  readonly noteCount: number;
  readonly minPitch: number;
  readonly maxPitch: number;
  readonly averagePitch: number;
}

export interface MidiAnalysis {
  /** Name stored in the MIDI header, if any. */
  readonly title: string | null;
  readonly durationMs: number;
  readonly noteCount: number;
  readonly minPitch: number;
  readonly maxPitch: number;
  /** Only tracks that contain notes. */
  readonly tracks: readonly MidiTrackSummary[];
}
