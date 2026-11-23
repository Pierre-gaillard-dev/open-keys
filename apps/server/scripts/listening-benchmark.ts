/**
 * Offline benchmark of the microphone note detection (V1.5), on the Salamander piano samples of the app:
 *
 *   pnpm --filter @open-keys/server listening:benchmark [room]
 *
 * Rooms: "studio" (clean samples, faint noise) or "phone" (default): a phone next to a real piano,
 * which is what fails in practice:
 * - its microphone cuts the bass (high-pass at 200 Hz): a low note has almost no fundamental, so C3
 *   looks like C4;
 * - the room reverberates (the previous notes ring on);
 * - the room is not silent: background noise, knocks and voices, which must trigger nothing.
 *
 * Wait mode checks: every note of a two-hand chord heard from one strike, a wrong note (semitone,
 * octave above or below) refused, and nothing heard in the noise alone. Needs ffmpeg for the samples.
 * Options: LISTEN_OPTIONS='{"verify":{"oddShare":0.3}}', LISTEN_FRAMES (frames in a row, default 2).
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { type ListenFrame, NoteListener } from "@open-keys/core";

const SAMPLE_RATE = 48_000;
const SAMPLES_DIR = join(import.meta.dirname, "../../web/public/samples/salamander");
const NOTE_NAMES = ["C", "Cs", "D", "Ds", "E", "F", "Fs", "G", "Gs", "A", "As", "B"];

interface Room {
  /** Microphone high-pass (Hz), 0 for none. */
  readonly highpassHz: number;
  /** Reverberation time (s), 0 for none. */
  readonly reverbS: number;
  /** Steady background noise (dBFS, pink). */
  readonly noiseDb: number;
  /** Knocks and voices during the noise test. */
  readonly events: boolean;
}

const ROOMS: Record<string, Room> = {
  studio: { highpassHz: 0, reverbS: 0, noiseDb: -60, events: false },
  phone: { highpassHz: 200, reverbS: 0.8, noiseDb: -45, events: true },
};
const roomName = process.argv[2] ?? "phone";
function selectRoom(name: string): Room {
  const selected = ROOMS[name];
  if (!selected) {
    throw new Error(`Unknown room ${name}: ${Object.keys(ROOMS).join(", ")}`);
  }
  return selected;
}
const room = selectRoom(roomName);
const options = JSON.parse(process.env["LISTEN_OPTIONS"] ?? "{}");
const REQUIRED_FRAMES = Number(process.env["LISTEN_FRAMES"] ?? 2);
/** A strike is judged on this window after it (the wait mode moves on as soon as the chord is heard). */
const JUDGED_S = 0.5;
const STRIKE_S = 0.6;
const LENGTH_S = STRIKE_S + 1.2;

/** Deterministic random numbers (mulberry32): the same chords at every run. */
let seed = 42;
const random = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
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
      ].concat([String(SAMPLE_RATE), "-"]),
      { maxBuffer: 64 * 1024 * 1024 },
    );
    pcm = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
    decoded.set(name, pcm);
  }
  return pcm;
}

/** The note `pitch` from the nearest sample (C, D#, F#, A), resampled like the app's sampler. */
function note(pitch: number): Float32Array {
  const sampled = [];
  for (let p = 21; p <= 108; p++) {
    if (["C", "Ds", "Fs", "A"].includes(NOTE_NAMES[p % 12] ?? "")) {
      sampled.push({ p, name: `${NOTE_NAMES[p % 12]}${Math.floor(p / 12) - 1}` });
    }
  }
  const nearest = sampled.reduce((best, c) => (Math.abs(c.p - pitch) < Math.abs(best.p - pitch) ? c : best));
  const source = sample(nearest.name);
  const ratio = 2 ** ((pitch - nearest.p) / 12);
  const out = new Float32Array(Math.floor(source.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const position = i * ratio;
    const index = Math.floor(position);
    const fraction = position - index;
    out[i] = (source[index] ?? 0) * (1 - fraction) + (source[index + 1] ?? 0) * fraction;
  }
  return out;
}

/** Second-order high-pass (RBJ biquad), in place. */
function highpass(signal: Float32Array, frequency: number): void {
  const w0 = (2 * Math.PI * frequency) / SAMPLE_RATE;
  const alpha = Math.sin(w0) / (2 * Math.SQRT1_2);
  const cos = Math.cos(w0);
  const a0 = 1 + alpha;
  const [b0, b1, b2] = [(1 + cos) / 2 / a0, -(1 + cos) / a0, (1 + cos) / 2 / a0];
  const [a1, a2] = [(-2 * cos) / a0, (1 - alpha) / a0];
  let [x1, x2, y1, y2] = [0, 0, 0, 0];
  for (let i = 0; i < signal.length; i++) {
    const x = signal[i] as number;
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    [x2, x1, y2, y1] = [x1, x, y1, y];
    signal[i] = y;
  }
}

/** Feedback comb filter of the reverberation, added to `wet` (a quarter each). */
function comb(signal: Float32Array, wet: Float32Array, delayMs: number, seconds: number): void {
  const delay = Math.round((delayMs / 1000) * SAMPLE_RATE);
  const gain = 10 ** ((-3 * delayMs) / 1000 / seconds);
  const out = new Float32Array(signal.length);
  for (let i = 0; i < signal.length; i++) {
    out[i] = (signal[i] as number) + (i >= delay ? (out[i - delay] as number) * gain : 0);
    wet[i] = (wet[i] as number) + (out[i] as number) / 4;
  }
}

/** All-pass filter of the reverberation, in place. */
function allPass(wet: Float32Array, delayMs: number): void {
  const delay = Math.round((delayMs / 1000) * SAMPLE_RATE);
  const input = Float32Array.from(wet);
  for (let i = 0; i < wet.length; i++) {
    const delayed = i >= delay ? (wet[i - delay] as number) : 0;
    const before = i >= delay ? (input[i - delay] as number) : 0;
    wet[i] = -0.7 * (input[i] as number) + before + 0.7 * delayed;
  }
}

/** Schroeder reverberation (4 combs, 2 all-passes) added to the dry signal, in place. */
function reverb(signal: Float32Array, seconds: number): void {
  const wet = new Float32Array(signal.length);
  for (const delayMs of [29.7, 37.1, 41.1, 43.7]) {
    comb(signal, wet, delayMs, seconds);
  }
  for (const delayMs of [5, 1.7]) {
    allPass(wet, delayMs);
  }
  for (let i = 0; i < signal.length; i++) {
    signal[i] = (signal[i] as number) + (wet[i] as number) * 0.5;
  }
}

/** Pink-ish background noise (white through a one-pole low-pass, plus some white). */
function addNoise(signal: Float32Array, db: number): void {
  const amplitude = 10 ** (db / 20);
  let low = 0;
  for (let i = 0; i < signal.length; i++) {
    const white = random() * 2 - 1;
    low = 0.98 * low + 0.02 * white;
    signal[i] = (signal[i] as number) + amplitude * (low * 6 + white * 0.4);
  }
}

/** A voice a few metres away: about 12 dB under a piano next to the phone. */
const VOICE_LEVEL = Number(process.env["LISTEN_VOICE"] ?? 0.01);

/** A knock (decaying broadband burst) or a voice (gliding harmonic tone) at `at`. */
function addEvent(signal: Float32Array, at: number): void {
  const start = Math.floor(at * SAMPLE_RATE);
  const kind = process.env["LISTEN_EVENTS"] ?? "both";
  if (kind === "knock" || (kind === "both" && random() < 0.5)) {
    for (let i = 0; i < 0.08 * SAMPLE_RATE && start + i < signal.length; i++) {
      const envelope = Math.exp(-i / (0.012 * SAMPLE_RATE));
      signal[start + i] = (signal[start + i] as number) + 0.3 * envelope * (random() * 2 - 1);
    }
    return;
  }
  const f0 = 100 + random() * 150;
  const glide = (random() - 0.5) * 0.4;
  const amplitudes = Array.from({ length: 12 }, () => random() / 2);
  let phase = 0;
  for (let i = 0; i < 0.45 * SAMPLE_RATE && start + i < signal.length; i++) {
    const t = i / SAMPLE_RATE;
    const frequency = f0 * (1 + glide * t + 0.02 * Math.sin(2 * Math.PI * 5.5 * t));
    phase += (2 * Math.PI * frequency) / SAMPLE_RATE;
    const envelope = Math.min(1, t / 0.03, (0.45 - t) / 0.05) * VOICE_LEVEL;
    let value = 0;
    for (let h = 1; h <= amplitudes.length; h++) {
      value += (amplitudes[h - 1] as number) * Math.sin(h * phase);
    }
    signal[start + i] = (signal[start + i] as number) + envelope * value;
  }
}

/** The microphone's view of notes struck together at STRIKE_S (and of room events), in frames. */
function listen(pitches: readonly number[], expected: readonly number[], events = 0): ListenFrame[] {
  const length = Math.floor(SAMPLE_RATE * LENGTH_S);
  const mix = new Float32Array(length);
  const strike = Math.floor(SAMPLE_RATE * STRIKE_S);
  // Velocities vary within a chord, as with real hands.
  for (const pitch of pitches) {
    const gain = 0.25 + random() * 0.3;
    const pcm = note(pitch);
    for (let i = 0; i < pcm.length && strike + i < length; i++) {
      mix[strike + i] = (mix[strike + i] as number) + (pcm[i] as number) * gain;
    }
  }
  if (room.reverbS > 0) {
    reverb(mix, room.reverbS);
  }
  for (let e = 0; e < events; e++) {
    addEvent(mix, 0.2 + random() * (LENGTH_S - 0.6));
  }
  addNoise(mix, room.noiseDb);
  if (room.highpassHz > 0) {
    highpass(mix, room.highpassHz);
  }
  lastChecks = [];
  const listener = new NoteListener({
    sampleRate: SAMPLE_RATE,
    ...options,
    verify: {
      ...options.verify,
      onCheck: (check: { present: boolean; salience: number }) => {
        if (check.present) {
          presentSaliences.push(check.salience);
        }
        lastChecks.push(check);
      },
    },
  });
  listener.expect(expected);
  const frames: ListenFrame[] = [];
  for (let i = 0; i < length; i += 128) {
    frames.push(...listener.push(mix.subarray(i, i + 128)));
  }
  return frames.map((frame) => ({ ...frame, time: frame.time - STRIKE_S }));
}

/** Checks of the last `listen`, for the diagnostics of missed notes (LISTEN_DEBUG). */
let lastChecks: unknown[] = [];

/** Salience of every note found present (tuning of the absolute threshold). */
let presentSaliences: number[] = [];
const quantiles = () => {
  const sorted = [...presentSaliences].sort((a, b) => a - b);
  const at = (q: number) => (sorted[Math.floor(q * (sorted.length - 1))] ?? 0).toExponential(1);
  presentSaliences = [];
  return `salience of notes found: p1 ${at(0.01)}, p5 ${at(0.05)}, p50 ${at(0.5)}, p95 ${at(0.95)}`;
};

/** Expected notes heard REQUIRED_FRAMES frames in a row within `[from, to]`, with the time of each. */
function heardNotes(frames: readonly ListenFrame[], expected: readonly number[], from: number, to: number) {
  const found = new Map<number, number>();
  const streak = new Map<number, number>();
  for (const frame of frames.filter((f) => f.time >= from && f.time <= to)) {
    for (const pitch of expected) {
      const count = frame.heard.includes(pitch) ? (streak.get(pitch) ?? 0) + 1 : 0;
      streak.set(pitch, count);
      if (count >= REQUIRED_FRAMES && !found.has(pitch)) {
        found.set(pitch, frame.time);
      }
    }
  }
  return found;
}

function chord(): number[] {
  const notes = new Set<number>();
  const [left, right] = [randomInt(1, 3), randomInt(1, 3)];
  const [leftRoot, rightRoot] = [randomInt(36, 52), randomInt(60, 76)];
  for (let i = 0; i < left; i++) {
    notes.add(leftRoot + randomInt(0, 7));
  }
  for (let i = 0; i < right; i++) {
    notes.add(rightRoot + randomInt(0, 7));
  }
  return [...notes].sort((a, b) => a - b);
}

const percent = (part: number, total: number) => `${((100 * part) / total).toFixed(1)} %`;
const out = (line: string) => process.stdout.write(`${line}\n`);
out(`Room "${roomName}" ${JSON.stringify(room)}, ${REQUIRED_FRAMES} frames in a row`);

// 1. Chords: all the notes from one strike, and a wrong note refused.
const ROUNDS = 150;
let complete = 0;
let notesTotal = 0;
let notesHeard = 0;
const missedByRegister = { bass: 0, middle: 0, treble: 0 };
const delays: number[] = [];
const refused = { semitone: 0, octaveUp: 0, octaveDown: 0 };
for (let round = 0; round < ROUNDS; round++) {
  const expected = chord();
  const found = heardNotes(listen(expected, expected), expected, 0, JUDGED_S);
  notesTotal += expected.length;
  notesHeard += found.size;
  for (const pitch of expected.filter((p) => !found.has(p))) {
    missedByRegister[pitch < 48 ? "bass" : pitch < 72 ? "middle" : "treble"]++;
    if (process.env["LISTEN_DEBUG"]) {
      // Checks of the missed note ~150 ms after the strike (frames come every 21 ms, expected.length each).
      const perFrame = expected.length;
      const frame = Math.round((STRIKE_S + 0.15 - 8192 / SAMPLE_RATE) / (1024 / SAMPLE_RATE));
      const check = lastChecks
        .slice(frame * perFrame, (frame + 1) * perFrame)
        .find((c) => (c as { pitch: number }).pitch === pitch);
      const fmt = (v: unknown) => (typeof v === "number" ? Number(v.toPrecision(2)) : v);
      out(`  missed ${pitch} in [${expected.join(" ")}]: ${JSON.stringify(check, (_k, v) => fmt(v))}`);
    }
  }
  if (found.size === expected.length) {
    complete++;
    delays.push(Math.max(...found.values()));
  }
  const wrongIndex = randomInt(0, expected.length - 1);
  const wrong = expected[wrongIndex] as number;
  for (const [kind, shift] of [
    ["semitone", random() < 0.5 ? -1 : 1],
    ["octaveUp", 12],
    ["octaveDown", -12],
  ] as const) {
    const played = expected.map((pitch, index) => (index === wrongIndex ? pitch + shift : pitch));
    if (expected.includes(wrong + shift)) {
      refused[kind]++;
      continue;
    }
    if (!heardNotes(listen(played, expected), expected, 0, JUDGED_S).has(wrong)) {
      refused[kind]++;
    }
  }
}
if (process.env["LISTEN_DEBUG"]) {
  out(`  (chords and wrong notes) ${quantiles()}`);
}
delays.sort((a, b) => a - b);
out(
  `Chords (${ROUNDS}): complete from one strike ${percent(complete, ROUNDS)}` +
    ` (median ${Math.round((delays[delays.length >> 1] ?? 0) * 1000)} ms), notes heard ${percent(notesHeard, notesTotal)}` +
    ` (missed: ${missedByRegister.bass} bass, ${missedByRegister.middle} middle, ${missedByRegister.treble} treble)`,
);
out(
  `Wrong note refused: semitone ${percent(refused.semitone, ROUNDS)}, octave above ${percent(refused.octaveUp, ROUNDS)},` +
    ` octave below ${percent(refused.octaveDown, ROUNDS)}`,
);

// 2. A single note expected, its octave played (C3 for C4, and C5): over the keyboard.
let octaveRounds = 0;
const octaveRefused = { below: 0, above: 0 };
for (let pitch = 36; pitch <= 84; pitch += 3) {
  octaveRounds++;
  for (const [kind, shift] of [
    ["below", -12],
    ["above", 12],
  ] as const) {
    if (!heardNotes(listen([pitch + shift], [pitch]), [pitch], 0, JUDGED_S).has(pitch)) {
      octaveRefused[kind]++;
    }
  }
}
out(
  `Single note, its octave played (${octaveRounds}): refused when below ${percent(octaveRefused.below, octaveRounds)},` +
    ` above ${percent(octaveRefused.above, octaveRounds)}`,
);

// 3. Nothing played: the room alone (noise, then knocks and voices) must not light any expected note.
const QUIET_ROUNDS = 60;
for (const events of room.events ? [0, 3] : [0]) {
  let triggered = 0;
  let heardInAll = 0;
  for (let round = 0; round < QUIET_ROUNDS; round++) {
    const expected = chord();
    const found = heardNotes(listen([], expected, events), expected, -STRIKE_S, LENGTH_S);
    heardInAll += found.size;
    triggered += found.size > 0 ? 1 : 0;
  }
  if (process.env["LISTEN_DEBUG"]) {
    out(`  (room alone) ${quantiles()}`);
  }
  out(
    `Room alone, ${events ? "knocks and voices" : "background noise"} (${QUIET_ROUNDS}): rounds with a note heard` +
      ` ${percent(triggered, QUIET_ROUNDS)} (${heardInAll} notes in all)`,
  );
}
