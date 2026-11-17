const PITCH_CLASS_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
const BLACK_PITCH_CLASSES: ReadonlySet<number> = new Set([1, 3, 6, 8, 10]);

export const MIN_MIDI_PITCH = 0;
export const MAX_MIDI_PITCH = 127;

function assertMidiPitch(pitch: number): void {
  if (!Number.isInteger(pitch) || pitch < MIN_MIDI_PITCH || pitch > MAX_MIDI_PITCH) {
    throw new RangeError(`Invalid MIDI pitch: ${pitch} (expected an integer between 0 and 127)`);
  }
}

function pitchClassOf(pitch: number): number {
  return pitch % 12;
}

/** English note name with octave, using the MIDI convention where 60 is C4. */
export function midiToNoteName(pitch: number): string {
  assertMidiPitch(pitch);
  const name = PITCH_CLASS_NAMES[pitchClassOf(pitch)];
  const octave = Math.floor(pitch / 12) - 1;
  return `${name}${octave}`;
}

/** English name without octave ("C", "C#"): what is written on falling notes and keys (UC-23). */
export function pitchClassName(pitch: number): string {
  assertMidiPitch(pitch);
  return PITCH_CLASS_NAMES[pitchClassOf(pitch)] ?? "";
}

export function isBlackKey(pitch: number): boolean {
  assertMidiPitch(pitch);
  return BLACK_PITCH_CLASSES.has(pitchClassOf(pitch));
}
