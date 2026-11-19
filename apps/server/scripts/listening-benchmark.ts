/**
 * Offline benchmark of the microphone note detection (V1.5), on the Salamander piano samples of the app:
 *
 *   pnpm --filter @open-keys/server listening:benchmark [noise-dB]
 *
 * Single notes, two-hand chords, and the check of the wait mode: the expected notes are played, or one
 * of them is replaced by its neighbour (semitone) or its octave. Needs ffmpeg to decode the samples.
 * A real piano in a real room is harder (reverberation, other noises): this only bounds the method.
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { type ListenFrame, NoteListener } from "@open-keys/core";

const SAMPLE_RATE = 48_000;
const SAMPLES_DIR = join(import.meta.dirname, "../../web/public/samples/salamander");
const NOTE_NAMES = ["C", "Cs", "D", "Ds", "E", "F", "Fs", "G", "Gs", "A", "As", "B"];
const noiseDb = Number(process.argv[2] ?? -50);
/** Detector options to try, as JSON (LISTEN_OPTIONS='{"relativeThreshold":0.3}'). */
const options = JSON.parse(process.env["LISTEN_OPTIONS"] ?? "{}");
/** Frames in a row a note must be heard in to count (wait mode). */
const REQUIRED_FRAMES = Number(process.env["LISTEN_FRAMES"] ?? 2);

/** Deterministic random numbers: the same chords at every run. */
let seed = 42;
const random = () => {
  seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
  return seed / 2 ** 31;
};
const randomInt = (low: number, high: number) => low + Math.floor(random() * (high - low + 1));

const decoded = new Map<string, Float32Array>();
function sample(name: string): Float32Array {
  let pcm = decoded.get(name);
  if (!pcm) {
    const raw = execFileSync(
      "ffmpeg",
      [
        "-v",
        "error",
        "-i",
        join(SAMPLES_DIR, `${name}.mp3`),
        "-t",
        "2",
        "-f",
        "f32le",
        "-ac",
        "1",
        "-ar",
        String(SAMPLE_RATE),
        "-",
      ],
      { maxBuffer: 64 * 1024 * 1024 },
    );
    pcm = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
    decoded.set(name, pcm);
  }
  return pcm;
}

/** The note `pitch` from the nearest sample (C, D#, F#, A), resampled like the app's sampler. */
function note(pitch: number): Float32Array {
  const candidates = [];
  for (let p = 21; p <= 108; p++) {
    const name = `${NOTE_NAMES[p % 12]}${Math.floor(p / 12) - 1}`;
    if (["C", "Ds", "Fs", "A"].includes(NOTE_NAMES[p % 12] ?? "") && p >= 21 && p <= 108) {
      candidates.push({ p, name });
    }
  }
  const nearest = candidates.reduce((best, c) =>
    Math.abs(c.p - pitch) < Math.abs(best.p - pitch) ? c : best,
  );
  const source = sample(nearest.name);
  const ratio = 2 ** ((pitch - nearest.p) / 12);
  const length = Math.floor(source.length / ratio);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const position = i * ratio;
    const index = Math.floor(position);
    const fraction = position - index;
    out[i] = (source[index] ?? 0) * (1 - fraction) + (source[index + 1] ?? 0) * fraction;
  }
  return out;
}

/** Notes struck together at 0.3 s, over noise: the frames the listener produces. */
function listen(pitches: readonly number[], expected: readonly number[] = [], gain = 0.5): ListenFrame[] {
  const length = SAMPLE_RATE * 1.3;
  const mix = new Float32Array(length);
  const noise = 10 ** (noiseDb / 20);
  for (let i = 0; i < length; i++) {
    mix[i] = (random() * 2 - 1) * noise;
  }
  const strike = Math.floor(SAMPLE_RATE * 0.3);
  for (const pitch of pitches) {
    const pcm = note(pitch);
    for (let i = 0; i < pcm.length && strike + i < length; i++) {
      mix[strike + i] = (mix[strike + i] as number) + (pcm[i] as number) * gain;
    }
  }
  const listener = new NoteListener({ sampleRate: SAMPLE_RATE, ...options });
  listener.expect(expected);
  const frames: ListenFrame[] = [];
  for (let i = 0; i < length; i += 128) {
    frames.push(...listener.push(mix.subarray(i, i + 128)));
  }
  return frames.map((frame) => ({ ...frame, time: frame.time - 0.3 }));
}

/** Wait mode: every expected note heard in REQUIRED_FRAMES frames in a row, within 0.4 s of the strike. */
function heard(frames: readonly ListenFrame[], expected: readonly number[]): number | null {
  const pending = new Set(expected);
  const streak = new Map<number, number>();
  for (const frame of frames.filter((f) => f.time >= 0 && f.time <= 0.4)) {
    for (const pitch of expected) {
      const count = frame.heard.includes(pitch) ? (streak.get(pitch) ?? 0) + 1 : 0;
      streak.set(pitch, count);
      if (count >= REQUIRED_FRAMES) {
        pending.delete(pitch);
      }
    }
    if (pending.size === 0) {
      return frame.time;
    }
  }
  return null;
}

function chord(): number[] {
  const notes = new Set<number>();
  const left = randomInt(1, 3);
  const right = randomInt(1, 3);
  const leftRoot = randomInt(36, 52);
  const rightRoot = randomInt(60, 76);
  for (let i = 0; i < left; i++) {
    notes.add(leftRoot + randomInt(0, 7));
  }
  for (let i = 0; i < right; i++) {
    notes.add(rightRoot + randomInt(0, 7));
  }
  return [...notes].sort((a, b) => a - b);
}

const percent = (part: number, total: number) => `${((100 * part) / total).toFixed(1)} %`;

// 1. Single notes over the whole keyboard.
let singleFound = 0;
let singleClean = 0;
let extraNotes = 0;
let windowFrames = 0;
const missed: number[] = [];
for (let pitch = 21; pitch <= 108; pitch++) {
  const frames = listen([pitch]);
  const window = frames.filter((frame) => frame.time > 0.05 && frame.time < 0.4);
  if (window.some((frame) => frame.notes.some((n) => n.pitch === pitch))) {
    singleFound++;
  } else {
    missed.push(pitch);
  }
  if (window.every((frame) => frame.notes.every((n) => n.pitch === pitch))) {
    singleClean++;
  }
  for (const frame of window) {
    extraNotes += frame.notes.filter((n) => n.pitch !== pitch).length;
    windowFrames++;
  }
}
process.stdout.write(
  `Single notes (88): found ${percent(singleFound, 88)}, without any other note ${percent(singleClean, 88)}` +
    ` (${(extraNotes / windowFrames).toFixed(2)} wrong notes per frame)` +
    `${missed.length ? `, missed ${missed.join(" ")}` : ""}\n`,
);

// 2. Wait mode on two-hand chords: right notes accepted, a wrong note refused.
const ROUNDS = 150;
let accepted = 0;
const delays: number[] = [];
const refused = { semitone: 0, octave: 0 };
for (let round = 0; round < ROUNDS; round++) {
  const expected = chord();
  const delay = heard(listen(expected, expected), expected);
  if (delay !== null) {
    accepted++;
    delays.push(delay);
  }
  const wrongIndex = randomInt(0, expected.length - 1);
  for (const [kind, shift] of [
    ["semitone", random() < 0.5 ? -1 : 1],
    ["octave", random() < 0.5 ? -12 : 12],
  ] as const) {
    const played = expected.map((pitch, index) => (index === wrongIndex ? pitch + shift : pitch));
    if (heard(listen(played, expected), expected) === null) {
      refused[kind]++;
    }
  }
}
delays.sort((a, b) => a - b);
process.stdout.write(
  `Chords (${ROUNDS}, noise ${noiseDb} dB): right notes accepted ${percent(accepted, ROUNDS)}` +
    ` (median ${Math.round((delays[delays.length >> 1] ?? 0) * 1000)} ms after the strike),` +
    ` wrong semitone refused ${percent(refused.semitone, ROUNDS)}, wrong octave refused ${percent(refused.octave, ROUNDS)}\n`,
);
