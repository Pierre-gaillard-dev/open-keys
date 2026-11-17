import { PianoSampler } from "../audio/piano-sampler";
import type { NoteOutput } from "../engine/note-scheduler";
import type { PlayerAudio } from "../engine/player-engine";

/** Web Audio only (AudioContext + piano): the player, and the preview of a piece before import. */
export interface AudioRuntime {
  readonly audio: PlayerAudio;
  readonly output: NoteOutput;
  loadSamples(): Promise<void>;
  close(): void;
}

export function createAudioRuntime(): AudioRuntime {
  const context = new AudioContext({ latencyHint: "interactive" });
  const sampler = new PianoSampler(context);
  return {
    audio: context,
    output: sampler,
    loadSamples: () => sampler.load(),
    close: () => void context.close(),
  };
}
