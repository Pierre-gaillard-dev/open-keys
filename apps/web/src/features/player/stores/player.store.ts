import { DEFAULT_HANDS_SETTINGS, type HandsSettings, type Loop } from "@open-keys/contracts";
import type { NoteNaming } from "@open-keys/core";
import { createStore, type StoreApi } from "zustand/vanilla";
import { DEFAULT_PLAYER_PREFERENCES, type PlayerPreferences } from "./player-preferences";

export interface LoopSelection {
  readonly startMs: number;
  readonly endMs: number;
  /** Saved loop id (null until saved). */
  readonly id: string | null;
  readonly name: string | null;
  /** Speed to reach (UC-26); 100 % when not set. */
  readonly targetTempoPct: number | null;
  /** Highest speed at which the loop was played several times in a row. */
  readonly bestTempoPct: number | null;
}

export function loopSelectionOf(loop: Loop): LoopSelection {
  return {
    startMs: loop.startMs,
    endMs: loop.endMs,
    id: loop.id,
    name: loop.name,
    targetTempoPct: loop.targetTempoPct,
    bestTempoPct: loop.bestTempoPct,
  };
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
  readonly preferences: PlayerPreferences;
  /** Note names of the account (C D E or Do Ré Mi): set by the account, not by the player. */
  readonly noteNaming: NoteNaming;
  /** Clicks left before the music starts (count-in), null otherwise. Changes once per beat. */
  readonly countInBeatsLeft: number | null;
  /** Full turns of the loop in a row at the current speed (UC-26). */
  readonly loopRuns: number;
  /** Speed proposed after enough turns in a row (+5 %, up to the target), null otherwise. */
  readonly speedUpOffer: number | null;
  /** Playing on the piano with the microphone (V1.5): wait mode or rhythm mode. */
  readonly piano: PianoState;
  /** Wait mode: notes of the chord awaited not heard yet, while stopped at it; null otherwise. */
  readonly waitingFor: readonly number[] | null;
  /** Score while playing on the piano, null otherwise. Changes once per chord. */
  readonly pianoScore: PianoScore | null;
  /** The song has its original recording (D35). */
  readonly recordingAvailable: boolean;
  readonly sound: SoundSource;
  /** The recording could not be loaded: back to the piano. */
  readonly recordingError: boolean;
}

export type PlayerStore = StoreApi<PlayerState>;

/** What is heard: the app's piano playing the notes, or the original recording of the song (D35). */
export type SoundSource = "piano" | "recording";

/** Hands the player plays on the real piano (muted in playback, listened to by the microphone). */
export type PianoHands = "left" | "right" | "both";

/** Playing on the piano (V1.5): playback waits for each chord, or goes on and judges each chord. */
export type PianoMode = "wait" | "rhythm";

export interface PianoState {
  readonly mode: PianoMode;
  readonly hands: PianoHands;
  /** "starting": the microphone is opening (permission asked). */
  readonly status: "off" | "starting" | "on" | "error";
  readonly error: string | null;
}

/** Chords played on the piano since the mode started: `good` right (rhythm) or without waiting. */
export interface PianoScore {
  readonly chords: number;
  readonly good: number;
}

export interface InitialPlayerState {
  readonly durationMs: number;
  readonly positionMs?: number;
  readonly tempoPct?: number;
  readonly hands?: HandsSettings;
  readonly zoom?: boolean;
  readonly preferences?: PlayerPreferences;
  readonly noteNaming?: NoteNaming;
  readonly recordingAvailable?: boolean;
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
    preferences: initial.preferences ?? DEFAULT_PLAYER_PREFERENCES,
    noteNaming: initial.noteNaming ?? "english",
    countInBeatsLeft: null,
    loopRuns: 0,
    speedUpOffer: null,
    piano: { mode: "wait", hands: "both", status: "off", error: null },
    waitingFor: null,
    pianoScore: null,
    recordingAvailable: initial.recordingAvailable ?? false,
    sound: "piano",
    recordingError: false,
  }));
}
