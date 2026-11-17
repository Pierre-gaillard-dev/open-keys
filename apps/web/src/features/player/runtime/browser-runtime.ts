import type { Timeline } from "@open-keys/core";
import { PianoSampler } from "../audio/piano-sampler";
import type { RendererPort } from "../controller/player-controller";
import type { NoteOutput } from "../engine/note-scheduler";
import type { PlayerAudio } from "../engine/player-engine";
import type { SongClock } from "../engine/song-clock";
import { FallingNotesRenderer, type RendererOptions } from "../renderer/falling-notes-renderer";

export interface PlayerRenderer extends RendererPort {
  init(host: HTMLElement): Promise<void>;
  destroy(): void;
}

/** Everything that needs a real browser (Web Audio, WebGL): replaced by fakes in component tests. */
export interface PlayerRuntime {
  readonly audio: PlayerAudio;
  readonly output: NoteOutput;
  loadSamples(): Promise<void>;
  createRenderer(timeline: Timeline, clock: SongClock, options: RendererOptions): PlayerRenderer;
  close(): void;
}

export function createBrowserRuntime(): PlayerRuntime {
  const context = new AudioContext({ latencyHint: "interactive" });
  const sampler = new PianoSampler(context);
  return {
    audio: context,
    output: sampler,
    loadSamples: () => sampler.load(),
    createRenderer: (timeline, clock, options) => new FallingNotesRenderer(timeline, clock, options),
    close: () => void context.close(),
  };
}
