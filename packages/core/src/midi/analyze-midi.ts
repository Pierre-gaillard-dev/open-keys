import { Midi, type Track } from "@tonejs/midi";
import type { MidiAnalysis, MidiTrackSummary } from "./midi.types";

const PERCUSSION_CHANNEL = 9;
const HEADER = [0x4d, 0x54, 0x68, 0x64]; // "MThd"

export class InvalidMidiError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "InvalidMidiError";
  }
}

export function hasMidiHeader(bytes: Uint8Array): boolean {
  return HEADER.every((byte, index) => bytes[index] === byte);
}

function parse(bytes: Uint8Array): Midi {
  if (!hasMidiHeader(bytes)) {
    throw new InvalidMidiError("Not a MIDI file (missing MThd header)");
  }
  try {
    return new Midi(bytes);
  } catch (cause) {
    throw new InvalidMidiError("Unreadable MIDI file", { cause });
  }
}

function summarizeTrack(track: Track, index: number): MidiTrackSummary {
  const pitches = track.notes.map((note) => note.midi);
  const total = pitches.reduce((sum, pitch) => sum + pitch, 0);
  return {
    index,
    channel: track.channel,
    name: track.name.trim() || null,
    instrument: track.instrument.name.trim() || null,
    isPercussion: track.instrument.percussion || track.channel === PERCUSSION_CHANNEL,
    noteCount: pitches.length,
    minPitch: Math.min(...pitches),
    maxPitch: Math.max(...pitches),
    averagePitch: total / pitches.length,
  };
}

/** Reads a MIDI file and summarizes what the catalogue and the hand assignment need. */
export function analyzeMidi(bytes: Uint8Array): MidiAnalysis {
  const midi = parse(bytes);
  const tracks = midi.tracks
    .map((track, index) => ({ track, index }))
    .filter(({ track }) => track.notes.length > 0)
    .map(({ track, index }) => summarizeTrack(track, index));
  if (tracks.length === 0) {
    throw new InvalidMidiError("The MIDI file contains no notes");
  }
  const lastNoteEnd = Math.max(
    ...midi.tracks.flatMap((t) => t.notes.map((note) => note.time + note.duration)),
  );
  return {
    title: midi.header.name.trim() || null,
    durationMs: Math.round(Math.max(midi.duration, lastNoteEnd) * 1000),
    noteCount: tracks.reduce((sum, track) => sum + track.noteCount, 0),
    minPitch: Math.min(...tracks.map((track) => track.minPitch)),
    maxPitch: Math.max(...tracks.map((track) => track.maxPitch)),
    tracks,
  };
}
