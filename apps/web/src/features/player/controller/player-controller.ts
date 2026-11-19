import type { HandsSettings } from "@open-keys/contracts";
import type { Hand } from "@open-keys/core";
import type { PlayerEngine } from "../engine/player-engine";
import type { RendererOptions } from "../renderer/falling-notes-renderer";
import type { LoopSelection, PlayerState, PlayerStore } from "../stores/player.store";
import { NOTE_NAMES_MODES, type NoteNamesMode, type PlayerPreferences } from "../stores/player-preferences";

export const MIN_TEMPO_PCT = 25;
export const MAX_TEMPO_PCT = 100;
export const TEMPO_STEP_PCT = 5;
const POSITION_REFRESH_MS = 100;
/** A loop shorter than this is almost certainly a mis-click. */
const MIN_LOOP_MS = 500;
/** Turns in a row at a speed for it to become the best speed of the loop (UC-26). */
export const RUNS_FOR_BEST = 3;
/** Turns in a row before proposing to speed up. */
export const RUNS_FOR_SPEED_UP = 5;
export const SPEED_UP_STEP_PCT = 5;

export interface RendererPort {
  setOptions(options: RendererOptions): void;
}

export interface PlaybackListener {
  playing(tempoPct: number): void;
  paused(): void;
  tempo(tempoPct: number): void;
}

const toSeconds = (ms: number) => ms / 1000;
const toMs = (seconds: number) => Math.round(seconds * 1000);

/** What the renderer shows, from the player state. */
export function rendererOptions(
  state: Pick<PlayerState, "hands" | "zoom" | "preferences" | "noteNaming">,
): RendererOptions {
  return {
    visibleHands: { left: state.hands.left.visible, right: state.hands.right.visible },
    zoom: state.zoom,
    noteNames: state.preferences.noteNames,
    noteNaming: state.noteNaming,
  };
}

/**
 * The only way the UI acts on playback: keeps the engine, the renderer and the store consistent.
 * Components call these actions and read the store; they never touch the engine.
 */
export function createPlayerController(
  engine: PlayerEngine,
  store: PlayerStore,
  listener?: PlaybackListener,
) {
  let renderer: RendererPort | undefined;
  let positionTimer: ReturnType<typeof setInterval> | undefined;
  let countInTimers: ReturnType<typeof setTimeout>[] = [];

  const syncPosition = () => store.setState({ positionMs: toMs(engine.position) });
  const stopPositionTimer = () => {
    clearInterval(positionTimer);
    positionTimer = undefined;
  };
  const updateRenderer = () => renderer?.setOptions(rendererOptions(store.getState()));
  const applyHands = (hands: HandsSettings) => {
    for (const hand of ["left", "right"] as const) {
      engine.setHandAudible(hand, hands[hand].audible);
      engine.setHandVolume(hand, hands[hand].volume);
    }
  };
  const setHands = (hands: HandsSettings) => {
    store.setState({ hands });
    applyHands(hands);
    updateRenderer();
  };
  const applyPreferences = (preferences: PlayerPreferences) => {
    engine.setCountIn(preferences.countIn);
    engine.setMetronome(preferences.metronome);
  };
  const setPreferences = (patch: Partial<PlayerPreferences>) => {
    const preferences = { ...store.getState().preferences, ...patch };
    store.setState({ preferences });
    applyPreferences(preferences);
    updateRenderer();
  };

  const clearCountIn = () => {
    countInTimers.forEach(clearTimeout);
    countInTimers = [];
    store.setState({ countInBeatsLeft: null });
  };
  /** The big "4, 3, 2, 1" follows the clicks (scheduled on the audio clock): one store update per beat. */
  const showCountIn = (clicks: readonly number[]) => {
    clearCountIn();
    const beat = clicks.length > 1 ? (clicks[1] ?? 0) - (clicks[0] ?? 0) : 0.5;
    const steps = [
      ...clicks.map((time, index) => ({ time, left: clicks.length - index })),
      {
        time: (clicks.at(-1) ?? engine.audioTime) + beat,
        left: null,
      },
    ];
    countInTimers = steps.map(({ time, left }) =>
      setTimeout(
        () => store.setState({ countInBeatsLeft: left }),
        Math.max(0, (time - engine.audioTime) * 1000),
      ),
    );
  };
  engine.onCountIn = showCountIn;
  const resetRuns = () => store.setState({ loopRuns: 0, speedUpOffer: null });
  const enableLoop = (loop: LoopSelection) => {
    engine.setLoop({ start: toSeconds(loop.startMs), end: toSeconds(loop.endMs) });
    store.setState({ loop, loopEnabled: true, pendingLoopStartMs: null });
    resetRuns();
    syncPosition();
  };

  /** One more full turn: best speed, then a proposal to speed up (UC-26). */
  const loopRestarted = () => {
    const { loop, tempoPct, loopRuns, speedUpOffer } = store.getState();
    if (!loop) {
      return;
    }
    const runs = loopRuns + 1;
    const best = runs >= RUNS_FOR_BEST && tempoPct > (loop.bestTempoPct ?? 0) ? tempoPct : loop.bestTempoPct;
    const target = loop.targetTempoPct ?? MAX_TEMPO_PCT;
    const offer =
      speedUpOffer ??
      (runs >= RUNS_FOR_SPEED_UP && tempoPct < target
        ? Math.min(target, tempoPct + SPEED_UP_STEP_PCT)
        : null);
    store.setState({ loopRuns: runs, speedUpOffer: offer, loop: { ...loop, bestTempoPct: best } });
  };
  engine.onLoopRestart = loopRestarted;

  const pause = () => {
    if (!engine.isPlaying) {
      return;
    }
    engine.pause();
    stopPositionTimer();
    clearCountIn();
    syncPosition();
    store.setState({ status: "ready" });
    listener?.paused();
  };

  const setTempo = (tempoPct: number) => {
    const clamped = Math.min(MAX_TEMPO_PCT, Math.max(MIN_TEMPO_PCT, Math.round(tempoPct)));
    engine.setRate(clamped / 100);
    store.setState({ tempoPct: clamped });
    resetRuns();
    listener?.tempo(clamped);
  };

  engine.onEnd = () => {
    stopPositionTimer();
    store.setState({ status: "ready", positionMs: 0 });
    listener?.paused();
  };

  // Initial state (restored settings) → engine.
  const initial = store.getState();
  engine.seek(toSeconds(initial.positionMs));
  engine.setRate(initial.tempoPct / 100);
  applyHands(initial.hands);
  applyPreferences(initial.preferences);

  return {
    /** The renderer starts asynchronously (WebGL): attach it once ready. */
    attachRenderer(port: RendererPort) {
      renderer = port;
      port.setOptions(rendererOptions(store.getState()));
    },

    async play() {
      if (engine.isPlaying || store.getState().status === "loading") {
        return;
      }
      await engine.play();
      store.setState({ status: "playing" });
      positionTimer = setInterval(syncPosition, POSITION_REFRESH_MS);
      listener?.playing(store.getState().tempoPct);
    },

    pause,

    async toggle() {
      if (engine.isPlaying) {
        pause();
      } else {
        await this.play();
      }
    },

    seekTo(positionMs: number) {
      engine.seek(toSeconds(positionMs));
      syncPosition();
    },

    seekBy(deltaMs: number) {
      this.seekTo(toMs(engine.position) + deltaMs);
    },

    setTempo,

    changeTempo(deltaPct: number) {
      setTempo(store.getState().tempoPct + deltaPct);
    },

    /** "A": loop start at the current position. */
    markLoopStart() {
      store.setState({ pendingLoopStartMs: toMs(engine.position) });
    },

    /** "B": closes the loop started with "A" and enables it. */
    markLoopEnd() {
      const startMs = store.getState().pendingLoopStartMs ?? store.getState().loop?.startMs ?? 0;
      const endMs = toMs(engine.position);
      if (endMs - startMs >= MIN_LOOP_MS) {
        enableLoop({ startMs, endMs, id: null, name: null, targetTempoPct: null, bestTempoPct: null });
      }
    },

    toggleLoop() {
      const { loop, loopEnabled } = store.getState();
      if (!loop) {
        return;
      }
      if (loopEnabled) {
        engine.setLoop(null);
        store.setState({ loopEnabled: false });
      } else {
        enableLoop(loop);
      }
    },

    selectLoop(loop: LoopSelection) {
      enableLoop(loop);
    },

    /** After the current loop was saved on the server. */
    loopSaved(id: string, name: string | null) {
      const loop = store.getState().loop;
      if (loop) {
        store.setState({ loop: { ...loop, id, name } });
      }
    },

    clearLoop() {
      engine.setLoop(null);
      store.setState({ loop: null, loopEnabled: false, pendingLoopStartMs: null });
      resetRuns();
    },

    /** Speed to reach on the current loop, null for 100 % (UC-26). */
    setLoopTarget(targetTempoPct: number | null) {
      const loop = store.getState().loop;
      if (loop) {
        store.setState({ loop: { ...loop, targetTempoPct } });
      }
    },

    acceptSpeedUp() {
      const offer = store.getState().speedUpOffer;
      if (offer !== null) {
        setTempo(offer);
      }
    },

    /** "Later": proposed again after as many turns. */
    dismissSpeedUp() {
      resetRuns();
    },

    toggleHand(hand: Hand, aspect: "audible" | "visible") {
      const hands = store.getState().hands;
      setHands({ ...hands, [hand]: { ...hands[hand], [aspect]: !hands[hand][aspect] } });
    },

    /** 0–100 % (UC-25). */
    setHandVolume(hand: Hand, volumePct: number) {
      const hands = store.getState().hands;
      const volume = Math.min(1, Math.max(0, Math.round(volumePct) / 100));
      setHands({ ...hands, [hand]: { ...hands[hand], volume } });
    },

    toggleZoom() {
      store.setState({ zoom: !store.getState().zoom });
      updateRenderer();
    },

    toggleCountIn() {
      setPreferences({ countIn: !store.getState().preferences.countIn });
    },

    toggleMetronome() {
      setPreferences({ metronome: !store.getState().preferences.metronome });
    },

    setNoteNames(noteNames: NoteNamesMode) {
      setPreferences({ noteNames });
    },

    /** Keyboard shortcut: off → notes → keys → both → off. */
    cycleNoteNames() {
      const current = NOTE_NAMES_MODES.indexOf(store.getState().preferences.noteNames);
      setPreferences({ noteNames: NOTE_NAMES_MODES[(current + 1) % NOTE_NAMES_MODES.length] ?? "off" });
    },

    dispose() {
      pause();
      stopPositionTimer();
      clearCountIn();
      engine.dispose();
    },
  };
}

export type PlayerController = ReturnType<typeof createPlayerController>;
