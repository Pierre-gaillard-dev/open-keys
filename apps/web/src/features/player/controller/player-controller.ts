import type { HandsSettings } from "@open-keys/contracts";
import type { Hand } from "@open-keys/core";
import type { PlayerEngine } from "../engine/player-engine";
import type { RendererOptions } from "../renderer/falling-notes-renderer";
import type { LoopSelection, PlayerStore } from "../stores/player.store";

export const MIN_TEMPO_PCT = 25;
export const MAX_TEMPO_PCT = 100;
export const TEMPO_STEP_PCT = 5;
const POSITION_REFRESH_MS = 100;
/** A loop shorter than this is almost certainly a mis-click. */
const MIN_LOOP_MS = 500;

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

function rendererOptions(hands: HandsSettings, zoom: boolean): RendererOptions {
  return { visibleHands: { left: hands.left.visible, right: hands.right.visible }, zoom };
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

  const syncPosition = () => store.setState({ positionMs: toMs(engine.position) });
  const stopPositionTimer = () => {
    clearInterval(positionTimer);
    positionTimer = undefined;
  };
  const applyHands = (hands: HandsSettings) => {
    engine.setHandAudible("left", hands.left.audible);
    engine.setHandAudible("right", hands.right.audible);
    renderer?.setOptions(rendererOptions(hands, store.getState().zoom));
  };
  const enableLoop = (loop: LoopSelection) => {
    engine.setLoop({ start: toSeconds(loop.startMs), end: toSeconds(loop.endMs) });
    store.setState({ loop, loopEnabled: true, pendingLoopStartMs: null });
    syncPosition();
  };

  const pause = () => {
    if (!engine.isPlaying) {
      return;
    }
    engine.pause();
    stopPositionTimer();
    syncPosition();
    store.setState({ status: "ready" });
    listener?.paused();
  };

  const setTempo = (tempoPct: number) => {
    const clamped = Math.min(MAX_TEMPO_PCT, Math.max(MIN_TEMPO_PCT, Math.round(tempoPct)));
    engine.setRate(clamped / 100);
    store.setState({ tempoPct: clamped });
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

  return {
    /** The renderer starts asynchronously (WebGL): attach it once ready. */
    attachRenderer(port: RendererPort) {
      renderer = port;
      const { hands, zoom } = store.getState();
      port.setOptions(rendererOptions(hands, zoom));
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
        enableLoop({ startMs, endMs, id: null, name: null });
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
    },

    toggleHand(hand: Hand, aspect: "audible" | "visible") {
      const hands = store.getState().hands;
      const next: HandsSettings = { ...hands, [hand]: { ...hands[hand], [aspect]: !hands[hand][aspect] } };
      store.setState({ hands: next });
      applyHands(next);
    },

    toggleZoom() {
      const zoom = !store.getState().zoom;
      store.setState({ zoom });
      renderer?.setOptions(rendererOptions(store.getState().hands, zoom));
    },

    dispose() {
      pause();
      stopPositionTimer();
      engine.dispose();
    },
  };
}

export type PlayerController = ReturnType<typeof createPlayerController>;
