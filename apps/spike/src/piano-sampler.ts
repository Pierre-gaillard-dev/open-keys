/**
 * Minimal piano sampler on the native Web Audio API (no Tone.js): Tone wraps the AudioContext,
 * which hides getOutputTimestamp/outputLatency and breaks on Firefox with an injected native context.
 */

/** Salamander samples exist every minor third: A0, then C, D#, F#, A for octaves 1–7, then C8. */
function samplePitches(): number[] {
  const pitches = [21];
  for (let octave = 1; octave <= 7; octave++) {
    const c = 12 * (octave + 1);
    pitches.push(c, c + 3, c + 6, c + 9);
  }
  pitches.push(108);
  return pitches;
}

const FILE_NAMES: Readonly<Record<number, string>> = { 0: "C", 3: "Ds", 6: "Fs", 9: "A" };

function sampleFileName(pitch: number): string {
  const octave = Math.floor(pitch / 12) - 1;
  return `${FILE_NAMES[pitch % 12] ?? "C"}${octave}.mp3`;
}

/** Time constant of the release (seconds): ~95 % decayed after 3 constants. */
const RELEASE_TIME_CONSTANT_S = 0.25;
const RELEASE_TAIL_S = RELEASE_TIME_CONSTANT_S * 5;
const STOP_FADE_S = 0.03;

interface Voice {
  readonly source: AudioBufferSourceNode;
  readonly gain: GainNode;
}

export class PianoSampler {
  readonly #context: AudioContext;
  readonly #buffers = new Map<number, AudioBuffer>();
  readonly #output: GainNode;
  readonly #voices = new Set<Voice>();

  constructor(context: AudioContext) {
    this.#context = context;
    const compressor = context.createDynamicsCompressor();
    compressor.connect(context.destination);
    this.#output = context.createGain();
    this.#output.gain.value = 0.7;
    this.#output.connect(compressor);
  }

  get activeVoices(): number {
    return this.#voices.size;
  }

  async load(baseUrl: string): Promise<void> {
    await Promise.all(
      samplePitches().map(async (pitch) => {
        const response = await fetch(`${baseUrl}${sampleFileName(pitch)}`);
        if (!response.ok) {
          throw new Error(`Cannot load sample ${sampleFileName(pitch)} (${response.status})`);
        }
        this.#buffers.set(pitch, await this.#context.decodeAudioData(await response.arrayBuffer()));
      }),
    );
  }

  /** Schedules a note at an absolute AudioContext time. */
  play(pitch: number, startTime: number, duration: number, velocity: number): void {
    const [samplePitch, buffer] = this.#nearestSample(pitch);
    if (!buffer) {
      return;
    }
    const source = this.#context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = 2 ** ((pitch - samplePitch) / 12);

    const gain = this.#context.createGain();
    const peak = (0.2 + 0.8 * velocity) ** 2;
    const releaseAt = startTime + duration;
    gain.gain.setValueAtTime(peak, startTime);
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

  /** Quickly fades out every playing or scheduled note. */
  stopAll(): void {
    const now = this.#context.currentTime;
    for (const { source, gain } of this.#voices) {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(0, now, STOP_FADE_S / 3);
      source.stop(now + STOP_FADE_S);
    }
  }

  #nearestSample(pitch: number): [number, AudioBuffer | undefined] {
    let best = 21;
    for (const candidate of this.#buffers.keys()) {
      if (Math.abs(candidate - pitch) < Math.abs(best - pitch)) {
        best = candidate;
      }
    }
    return [best, this.#buffers.get(best)];
  }
}
