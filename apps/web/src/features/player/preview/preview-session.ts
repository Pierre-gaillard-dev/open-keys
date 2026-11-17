import { PlayerEngine } from "../engine/player-engine";
import { createAudioRuntime } from "../runtime/audio-runtime";
import { previewTimeline } from "./preview-timeline";

/** Audio of the previews of a page: one AudioContext and piano, shared by every preview. */
export interface PreviewSession {
  /** Ready to play (piano samples decoded). */
  readonly ready: Promise<void>;
  /** A new engine for `bytes`, not started. */
  engineFor(bytes: Uint8Array): PlayerEngine;
  close(): void;
}

export function createPreviewSession(): PreviewSession {
  const runtime = createAudioRuntime();
  return {
    ready: runtime.loadSamples(),
    engineFor: (bytes) =>
      new PlayerEngine(previewTimeline(bytes), runtime.audio, runtime.output, runtime.clicks),
    close: () => runtime.close(),
  };
}
