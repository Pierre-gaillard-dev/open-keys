import { NoteListener } from "@open-keys/core";
import type { EngineOptions, ListeningEngine, Sensitivity } from "./listening-engine";

/**
 * Least salience of a note (absolute threshold, before the other notes of a chord are removed). Measured
 * on the benchmark: a piano next to the phone is around 17, a voice a few metres away around 2.
 */
const MIN_SALIENCE: Readonly<Record<Sensitivity, number>> = { high: 0, medium: 3, low: 6 };

/** Analysis window of the detector (its default FFT size). */
const FFT_SIZE = 8192;

/** Smoothing of the measured analysis time. */
const SMOOTHING = 0.1;

/** The in-house detector (`core/listening`): spectrum analysis, a frame every 21 ms. */
export function createDspEngine({ sampleRate, sensitivity, onFrame }: EngineOptions): ListeningEngine {
  const listener = new NoteListener({
    sampleRate,
    verify: { minSalience: MIN_SALIENCE[sensitivity] },
  });
  let meanMs = 0;
  return {
    expect: (pitches) => listener.expect(pitches),
    push(samples) {
      const start = performance.now();
      const frames = listener.push(samples);
      if (frames.length > 0) {
        const perFrame = (performance.now() - start) / frames.length;
        meanMs = meanMs === 0 ? perFrame : meanMs + (perFrame - meanMs) * SMOOTHING;
      }
      // A frame describes its whole window: dated at its middle, like Basic Pitch's frames, so the
      // delays shown by the lab compare.
      const halfWindow = FFT_SIZE / 2 / sampleRate;
      for (const frame of frames) {
        onFrame({ ...frame, time: frame.time - halfWindow });
      }
    },
    analysisMs: () => meanMs,
    dispose: () => undefined,
  };
}
