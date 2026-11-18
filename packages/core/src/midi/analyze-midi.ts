import type { MidiAnalysis, MidiTrackSummary } from "./midi.types";
import { Midi, type Track } from "./tonejs-midi";

const PERCUSSION_CHANNEL = 9;
/**
 * Words of the placeholder or instrument names that software writes where the title should be: the name
 * of the first track ("control track" by LilyPond, "Piste 1" by MuseScore, "Grand Piano 1" by DAWs).
 */
const TRACK_NAME_WORDS: ReadonlySet<string> = new Set(
  [
    "control track tempo conductor sequence untitled score new song midi file out channel ch",
    "piste pista spur traccia part staff voice instrument canal",
    "piano pianoforte grand acoustic electric bright upright keyboard keys organ synth lead pad",
    "strings string violin viola cello bass guitar drums drum kit percussion flute choir ensemble",
    "vocals melody harmony left right hand lh rh treble main gauche droite mano",
  ]
    .join(" ")
    .split(" "),
);
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

/** The header name, unless it only names a track or an instrument ("Piste 1", "Grand Piano 1"). */
function meaningfulTitle(name: string): string | null {
  const title = name.trim();
  const words = title
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter((word) => word.length > 0);
  return words.every((word) => TRACK_NAME_WORDS.has(word)) ? null : title;
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
    title: meaningfulTitle(midi.header.name),
    durationMs: Math.round(Math.max(midi.duration, lastNoteEnd) * 1000),
    noteCount: tracks.reduce((sum, track) => sum + track.noteCount, 0),
    minPitch: Math.min(...tracks.map((track) => track.minPitch)),
    maxPitch: Math.max(...tracks.map((track) => track.maxPitch)),
    tracks,
  };
}
