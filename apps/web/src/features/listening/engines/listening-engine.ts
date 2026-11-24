import type { DetectedNote } from "@open-keys/core";

/** One analysis of the microphone: what sounds, and which of the expected notes are heard. */
export interface EngineFrame {
  /** End of the analysed audio, in seconds since the microphone opened. */
  readonly time: number;
  /** Notes heard by free detection, strongest first (strength: arbitrary unit within one engine). */
  readonly notes: readonly DetectedNote[];
  /** The expected notes heard in this frame. */
  readonly heard: readonly number[];
}

/** How easily a note counts as heard: a quiet room and a soft touch, or a noisy one. */
export type Sensitivity = "low" | "medium" | "high";

export interface EngineOptions {
  readonly sampleRate: number;
  readonly sensitivity: Sensitivity;
  readonly onFrame: (frame: EngineFrame) => void;
}

/**
 * A way of hearing notes from the microphone (V1.5): the in-house detector (spectrum analysis) or
 * Basic Pitch (Spotify's neural network). Both are compared in the microphone lab before one is kept.
 */
export interface ListeningEngine {
  /** Notes to play now (wait mode): frames say which of them are heard. */
  expect(pitches: readonly number[], accompaniment?: readonly number[]): void;
  /** Microphone samples, in chunks of any size. */
  push(samples: Float32Array): void;
  /** Mean time of one analysis (ms): too slow on a phone, the engine cannot follow. */
  analysisMs(): number;
  dispose(): void;
}

export type EngineKind = "dsp" | "basic-pitch";
