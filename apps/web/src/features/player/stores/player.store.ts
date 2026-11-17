import { DEFAULT_HANDS_SETTINGS, type HandsSettings } from "@open-keys/contracts";
import { createStore, type StoreApi } from "zustand/vanilla";

export interface LoopSelection {
  readonly startMs: number;
  readonly endMs: number;
  /** Saved loop id (null until saved). */
  readonly id: string | null;
  readonly name: string | null;
}

/**
 * What the controls display. Updated at most ~10 times per second: the animation never goes
 * through React (it reads the audio clock directly).
 */
export interface PlayerState {
  readonly status: "loading" | "ready" | "playing" | "error";
  readonly error: string | null;
  readonly positionMs: number;
  readonly durationMs: number;
  readonly tempoPct: number;
  readonly loop: LoopSelection | null;
  readonly loopEnabled: boolean;
  /** "A" set, waiting for "B". */
  readonly pendingLoopStartMs: number | null;
  readonly hands: HandsSettings;
  readonly zoom: boolean;
}

export type PlayerStore = StoreApi<PlayerState>;

export interface InitialPlayerState {
  readonly durationMs: number;
  readonly positionMs?: number;
  readonly tempoPct?: number;
  readonly hands?: HandsSettings;
  readonly zoom?: boolean;
}

export function createPlayerStore(initial: InitialPlayerState): PlayerStore {
  return createStore<PlayerState>()(() => ({
    status: "loading",
    error: null,
    positionMs: Math.min(initial.positionMs ?? 0, initial.durationMs),
    durationMs: initial.durationMs,
    tempoPct: initial.tempoPct ?? 100,
    loop: null,
    loopEnabled: false,
    pendingLoopStartMs: null,
    hands: initial.hands ?? DEFAULT_HANDS_SETTINGS,
    zoom: initial.zoom ?? false,
  }));
}
