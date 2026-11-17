import type { NoteOutput } from "../engine/note-scheduler";

/**
 * Piano sampler on the native Web Audio API (D17: no Tone.js, which hides outputLatency and breaks on
 * Firefox). Salamander samples exist every minor third; other notes are transposed with playbackRate.
 */

export const SAMPLES_BASE_URL = "/samples/salamander/";

const LOWEST_SAMPLE = 21; // A0
const HIGHEST_SAMPLE = 108; // C8
const FILE_PREFIX: Readonly<Record<number, string>> = { 0: "C", 3: "Ds", 6: "Fs", 9: "A" };

export function samplePitches(): number[] {
  const pitches = [LOWEST_SAMPLE];
  for (let octave = 1; octave <= 7; octave++) {
    const c = 12 * (octave + 1);
    pitches.push(c, c + 3, c + 6, c + 9);
  }
  pitches.push(HIGHEST_SAMPLE);
  return pitches;
}

export function sampleFileName(pitch: number): string {
  return `${FILE_PREFIX[pitch % 12] ?? "C"}${Math.floor(pitch / 12) - 1}.mp3`;
}

/** Release time constant: ~95 % decayed after three constants. */
const RELEASE_TIME_CONSTANT_S = 0.25;
const RELEASE_TAIL_S = RELEASE_TIME_CONSTANT_S * 5;
const STOP_FADE_S = 0.03;
const OUTPUT_GAIN = 0.7;

interface Voice {
  readonly source: AudioBufferSourceNode;
  readonly gain: GainNode;
}

export class PianoSampler implements NoteOutput {
  readonly #context: AudioContext;
  readonly #buffers = new Map<number, AudioBuffer>();
  readonly #output: GainNode;
  readonly #voices = new Set<Voice>();

  constructor(context: AudioContext) {
    this.#context = context;
    // The compressor prevents clipping in dense passages (many simultaneous voices).
    const compressor = context.createDynamicsCompressor();
    compressor.connect(context.destination);
    this.#output = context.createGain();
    this.#output.gain.value = OUTPUT_GAIN;
    this.#output.connect(compressor);
  }

  async load(baseUrl = SAMPLES_BASE_URL): Promise<void> {
    await Promise.all(
      samplePitches().map(async (pitch) => {
        const response = await fetch(`${baseUrl}${sampleFileName(pitch)}`);
        if (!response.ok) {
          throw new Error(`Cannot load piano sample ${sampleFileName(pitch)} (${response.status})`);
        }
        this.#buffers.set(pitch, await this.#context.decodeAudioData(await response.arrayBuffer()));
      }),
    );
  }

  play(pitch: number, startTime: number, duration: number, velocity: number): void {
    const samplePitch = this.#nearestSample(pitch);
    const buffer = this.#buffers.get(samplePitch);
    if (!buffer) {
      return;
    }
    const source = this.#context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = 2 ** ((pitch - samplePitch) / 12);
    const gain = this.#context.createGain();
    const releaseAt = startTime + duration;
    gain.gain.setValueAtTime((0.2 + 0.8 * velocity) ** 2, startTime);
    gain.gain.setTargetAtTime(0, releaseAt, RELEASE_TIME_CONSTANT_S);
    source.connect(gain).connect(this.#output);
    source.start(startTime);
    source.stop(releaseAt + RELEASE_TAIL_S);

    const voice: Voice = { source, gain };
    this.#voices.add(voice);
    source.addEventListener("ended", () => {
      this.#voices.delete(voice);
      gain.disconnect();
    });
  }

  /** Quick fade-out of every playing or scheduled note (pause, seek). */
  stopAll(): void {
    const now = this.#context.currentTime;
    for (const { source, gain } of this.#voices) {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(0, now, STOP_FADE_S / 3);
      source.stop(now + STOP_FADE_S);
    }
  }

  #nearestSample(pitch: number): number {
    let best = LOWEST_SAMPLE;
    for (const candidate of this.#buffers.keys()) {
      if (Math.abs(candidate - pitch) < Math.abs(best - pitch)) {
        best = candidate;
      }
    }
    return best;
  }
}
