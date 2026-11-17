import { describe, expect, it } from "vitest";
import { InvalidMidiError } from "./analyze-midi";
import { buildMidi, scale } from "./midi-fixtures";
import { parseMidiNotes } from "./parse-notes";
import { Midi } from "./tonejs-midi";

function withPedal(downAt: number, upAt: number): Uint8Array {
  const midi = new Midi();
  const track = midi.addTrack();
  track.addNote({ midi: 60, time: 0, duration: 0.5 });
  track.addNote({ midi: 64, time: 2, duration: 0.5 });
  track.addCC({ number: 64, value: 1, time: downAt });
  track.addCC({ number: 64, value: 0, time: upAt });
  return midi.toArray();
}

describe("parseMidiNotes", () => {
  it("returns every note sorted by start then pitch, with its track", () => {
    const parsed = parseMidiNotes(buildMidi([{ notes: scale(64, 2) }, { notes: scale(40, 2) }]));

    expect(parsed.notes.map((note) => [note.trackIndex, note.pitch, note.start])).toEqual([
      [1, 40, 0],
      [0, 64, 0],
      [1, 41, 0.5],
      [0, 65, 0.5],
    ]);
    expect(parsed.durationS).toBe(1);
  });

  it("extends the sound, not the key press, while the pedal is down", () => {
    const parsed = parseMidiNotes(withPedal(0, 1.5));
    const [held, after] = parsed.notes;

    expect(held).toMatchObject({ end: 0.5, soundEnd: 1.5 });
    expect(after).toMatchObject({ end: 2.5, soundEnd: 2.5 });
  });

  it("rejects non-MIDI data", () => {
    expect(() => parseMidiNotes(new Uint8Array([1, 2, 3, 4]))).toThrow(InvalidMidiError);
  });
});
