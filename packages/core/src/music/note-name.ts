/** English letters (C D E) or French syllables (Do Ré Mi): a setting of each account. */
export const NOTE_NAMINGS = ["english", "latin"] as const;
export type NoteNaming = (typeof NOTE_NAMINGS)[number];

const PITCH_CLASS_NAMES: Record<NoteNaming, readonly string[]> = {
  english: ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"],
  latin: ["Do", "Do#", "Ré", "Ré#", "Mi", "Fa", "Fa#", "Sol", "Sol#", "La", "La#", "Si"],
};
/**
 * Octave of middle C (MIDI 60): C4 in the English (scientific) convention, Do3 in the French one, where
 * the octave starts one lower (A 440 Hz is La3).
 */
const MIDDLE_C_OCTAVE: Record<NoteNaming, number> = { english: 4, latin: 3 };
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

/** Octave number of a pitch: 4 for middle C in English (C4), 3 in French (Do3). */
export function octaveOf(pitch: number, naming: NoteNaming = "english"): number {
  assertMidiPitch(pitch);
  return Math.floor(pitch / 12) - 5 + MIDDLE_C_OCTAVE[naming];
}

/** Note name with octave: "C4" in English, "Do3" in French (both are MIDI 60). */
export function midiToNoteName(pitch: number, naming: NoteNaming = "english"): string {
  return `${pitchClassName(pitch, naming)}${octaveOf(pitch, naming)}`;
}

/** Name without octave ("C#", "Do#"): what is written on falling notes and keys (UC-23). */
export function pitchClassName(pitch: number, naming: NoteNaming = "english"): string {
  assertMidiPitch(pitch);
  return PITCH_CLASS_NAMES[naming][pitchClassOf(pitch)] ?? "";
}

export function isBlackKey(pitch: number): boolean {
  assertMidiPitch(pitch);
  return BLACK_PITCH_CLASSES.has(pitchClassOf(pitch));
}
