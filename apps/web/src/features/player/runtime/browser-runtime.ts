import type { Timeline } from "@open-keys/core";
import type { RendererPort } from "../controller/player-controller";
import type { SongClock } from "../engine/song-clock";
import { FallingNotesRenderer, type RendererOptions } from "../renderer/falling-notes-renderer";
import { type AudioRuntime, createAudioRuntime } from "./audio-runtime";

export interface PlayerRenderer extends RendererPort {
  init(host: HTMLElement): Promise<void>;
  destroy(): void;
}

/** Everything that needs a real browser (Web Audio, WebGL): replaced by fakes in component tests. */
export interface PlayerRuntime extends AudioRuntime {
  createRenderer(timeline: Timeline, clock: SongClock, options: RendererOptions): PlayerRenderer;
}

export function createBrowserRuntime(): PlayerRuntime {
  return {
    ...createAudioRuntime(),
    createRenderer: (timeline, clock, options) => new FallingNotesRenderer(timeline, clock, options),
  };
}
