import {
  type Hand,
  type InputSource,
  notesInWindow,
  type WaitPoint,
  WaitTracker,
  waitPoints,
} from "@open-keys/core";
import type { PlayerEngine } from "../engine/player-engine";
import type { PlayerStore, WaitHands } from "../stores/player.store";

/** How often the wait mode checks where playback is and what was heard (no React update per check). */
export const WAIT_TICK_MS = 25;
/** Accompaniment of a chord: what the app plays from this long before it to this long after. */
const ACCOMPANIMENT_S = 0.5;

const HANDS: Readonly<Record<WaitHands, readonly Hand[]>> = {
  left: ["left"],
  right: ["right"],
  both: ["left", "right"],
};

const sameNotes = (a: readonly number[] | null, b: readonly number[] | null) =>
  a === b || (a !== null && b !== null && a.length === b.length && a.every((pitch, i) => pitch === b[i]));

/**
 * Wait mode (V1.5): playback stops at each chord of the hands practised (the engine's gate) until the
 * input hears it, then goes on. The input is told which notes to listen for. `now` is the input's
 * clock (seconds).
 */
export function createWaitMode(
  engine: PlayerEngine,
  store: PlayerStore,
  now: () => number = () => performance.now() / 1000,
) {
  let input: InputSource | null = null;
  let tracker: WaitTracker | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;
  let listening: WaitPoint | null = null;

  const gateAtCurrent = () => engine.setGate(tracker?.current?.time ?? null);

  /** Notes of the other hands the app plays around `point`: known sounds for the microphone. */
  const accompaniment = (point: WaitPoint): number[] => {
    const practised = HANDS[store.getState().wait.hands];
    const around = notesInWindow(engine.timeline, point.time - ACCOMPANIMENT_S, point.time + ACCOMPANIMENT_S);
    return [...new Set(around.filter((note) => !practised.includes(note.hand)).map((note) => note.pitch))];
  };

  const listenFor = (point: WaitPoint | null) => {
    if (point !== listening) {
      listening = point;
      input?.expect(point?.pitches ?? [], point ? accompaniment(point) : []);
    }
  };

  const tick = () => {
    if (!tracker) {
      return;
    }
    tracker.update(engine.position, engine.clock.rate, now());
    if (tracker.satisfied) {
      tracker.advance();
      gateAtCurrent();
      engine.release();
    }
    listenFor(tracker.current);
    const waitingFor = engine.isWaiting ? tracker.missing() : null;
    if (!sameNotes(waitingFor, store.getState().waitingFor)) {
      store.setState({ waitingFor });
    }
  };

  const restart = () => {
    const { hands } = store.getState().wait;
    tracker = new WaitTracker(waitPoints(engine.timeline.notes, HANDS[hands]));
    tracker.seek(engine.position);
    gateAtCurrent();
    tick();
  };

  return {
    /** Hands muted in playback: the player plays them on the real piano. */
    practisedHands(): readonly Hand[] {
      return input ? HANDS[store.getState().wait.hands] : [];
    },

    get enabled(): boolean {
      return input !== null;
    },

    enable(source: InputSource) {
      input = source;
      listening = null;
      source.onNote = (pitch, time) => {
        tracker?.noteHeard(pitch, time);
        tick();
      };
      engine.onWait = tick;
      restart();
      timer = setInterval(tick, WAIT_TICK_MS);
    },

    /** The input is closed by the caller (it opened it). */
    disable() {
      clearInterval(timer);
      timer = undefined;
      if (input) {
        input.onNote = null;
      }
      input = null;
      tracker = null;
      engine.onWait = () => undefined;
      engine.setGate(null);
      engine.release();
      store.setState({ waitingFor: null });
    },

    /** Other hands practised: the chords awaited change. */
    handsChanged() {
      if (input) {
        restart();
      }
    },

    /** Playback moved (seek, loop, end): the next chord is the first from there. */
    moved() {
      if (tracker) {
        tracker.seek(engine.position);
        gateAtCurrent();
        tick();
      }
    },
  };
}

export type WaitMode = ReturnType<typeof createWaitMode>;
