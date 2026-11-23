import type { DetectedNote } from "@open-keys/core";
import type { EngineFrame, EngineOptions, ListeningEngine, Sensitivity } from "./listening-engine";

/** What the model expects (Basic Pitch): mono at 22 050 Hz, a frame of output every 256 samples. */
const MODEL_RATE = 22_050;
const MODEL_HOP = 256;
const MODEL_URL = "/models/basic-pitch/model.json";
const LOWEST_PITCH = 21;
/**
 * Audio given to each analysis: the longest that fits one window of the model (2 s minus its padding
 * and overlap: 32 324 samples). Longer, the model would run twice.
 */
const WINDOW_SAMPLES = 32_000;
/** A new analysis once this much new audio has arrived (and the previous one is done). */
const MIN_NEW_SAMPLES = Math.round(MODEL_RATE * 0.1);
/** The last frames of a window see no audio after them: they are left to the next analysis. */
const EDGE_FRAMES = 3;
/** Probability from which a note is heard: the higher, the fewer false notes but the more missed ones. */
const THRESHOLD: Readonly<Record<Sensitivity, number>> = { high: 0.3, medium: 0.4, low: 0.5 };
const SMOOTHING = 0.2;

/** Linear resampling of a stream to the model's rate, chunk by chunk. */
function createResampler(fromRate: number) {
  const step = fromRate / MODEL_RATE;
  let position = 0;
  let previous = 0;
  return (input: Float32Array): Float32Array => {
    const output: number[] = [];
    // `position` is relative to the previous sample (index -1 of this chunk).
    while (position < input.length) {
      const index = Math.floor(position);
      const fraction = position - index;
      const before = index === 0 ? previous : (input[index - 1] as number);
      output.push(before + ((input[index] as number) - before) * fraction);
      position += step;
    }
    position -= input.length;
    previous = input[input.length - 1] ?? previous;
    return Float32Array.from(output);
  };
}

/**
 * Basic Pitch (Spotify, Apache-2.0): a small neural network for polyphonic transcription, run by
 * TensorFlow.js on the GPU (WebGL). Loaded on demand (about 3 MB): only the lab uses it for now.
 */
export async function createBasicPitchEngine({
  sampleRate,
  sensitivity,
  onFrame,
}: EngineOptions): Promise<ListeningEngine> {
  const [tf, { BasicPitch }] = await Promise.all([
    import("@tensorflow/tfjs"),
    import("@spotify/basic-pitch"),
  ]);
  if (!(await tf.setBackend("webgl"))) {
    await tf.setBackend("cpu");
  }
  await tf.ready();
  const model = new BasicPitch(tf.loadGraphModel(MODEL_URL));
  const threshold = THRESHOLD[sensitivity];
  const resample = createResampler(sampleRate);
  const window = new Float32Array(WINDOW_SAMPLES);
  let received = 0;
  let sinceAnalysis = 0;
  let busy = false;
  let disposed = false;
  let expected: readonly number[] = [];
  let lastEmitted = Number.NEGATIVE_INFINITY;
  let meanMs = 0;

  const toFrame = (time: number, probabilities: readonly number[]): EngineFrame => {
    const notes: DetectedNote[] = [];
    probabilities.forEach((probability, key) => {
      if (probability >= threshold) {
        notes.push({ pitch: LOWEST_PITCH + key, strength: probability });
      }
    });
    notes.sort((a, b) => b.strength - a.strength);
    return {
      time,
      notes,
      heard: expected.filter((pitch) => (probabilities[pitch - LOWEST_PITCH] ?? 0) >= threshold),
    };
  };

  const analyse = async () => {
    busy = true;
    sinceAnalysis = 0;
    const audio = Float32Array.from(window);
    const windowStart = (received - WINDOW_SAMPLES) / MODEL_RATE;
    const start = performance.now();
    const frames: number[][] = [];
    await model.evaluateModel(
      audio,
      (output) => frames.push(...output),
      () => undefined,
    );
    const elapsed = performance.now() - start;
    meanMs = meanMs === 0 ? elapsed : meanMs + (elapsed - meanMs) * SMOOTHING;
    busy = false;
    if (disposed) {
      return;
    }
    frames.slice(0, Math.max(0, frames.length - EDGE_FRAMES)).forEach((probabilities, index) => {
      const time = windowStart + (index * MODEL_HOP) / MODEL_RATE;
      if (time > lastEmitted) {
        lastEmitted = time;
        onFrame(toFrame(time, probabilities));
      }
    });
  };

  return {
    expect(pitches) {
      expected = [...pitches];
    },
    push(samples) {
      const resampled = resample(samples);
      // Keep the last WINDOW_SAMPLES samples, oldest first.
      if (resampled.length >= WINDOW_SAMPLES) {
        window.set(resampled.subarray(resampled.length - WINDOW_SAMPLES));
      } else {
        window.copyWithin(0, resampled.length);
        window.set(resampled, WINDOW_SAMPLES - resampled.length);
      }
      received += resampled.length;
      sinceAnalysis += resampled.length;
      if (!busy && received >= WINDOW_SAMPLES && sinceAnalysis >= MIN_NEW_SAMPLES) {
        void analyse();
      }
    },
    analysisMs: () => meanMs,
    dispose() {
      disposed = true;
    },
  };
}
