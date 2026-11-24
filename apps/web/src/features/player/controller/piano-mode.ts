import {
  type Hand,
  type InputSource,
  type Judgement,
  notesInWindow,
  RhythmTracker,
  type WaitPoint,
  WaitTracker,
  waitPoints,
} from "@open-keys/core";
import type { PlayerEngine } from "../engine/player-engine";
import type { PianoHands, PianoScore, PlayerStore } from "../stores/player.store";

/** How often the piano mode checks where playback is and what was heard (no React update per check). */
export const PIANO_TICK_MS = 25;
/** Accompaniment: what the app plays from this long before to this long after (song seconds). */
const ACCOMPANIMENT_S = 0.5;
/** Wait mode: a chord played while playback waited this long at most still counts as on time. */
const ON_TIME_WAIT_S = 0.15;

/** Marks of the notes, read by the renderer every frame: played, or missed (rhythm mode). */
export const NOTE_PLAYED = 1;
export const NOTE_MISSED = 2;

const HANDS: Readonly<Record<PianoHands, readonly Hand[]>> = {
  left: ["left"],
  right: ["right"],
  both: ["left", "right"],
};

const sameNotes = (a: readonly number[] | null, b: readonly number[] | null) =>
  a === b || (a !== null && b !== null && a.length === b.length && a.every((pitch, i) => pitch === b[i]));

/**
 * Playing on the piano (V1.5), with an input (the microphone) that hears the hands practised:
 * - wait mode: playback stops at each chord (the engine's gate) until it is heard;
 * - rhythm mode: playback goes on, each chord is judged as it passes (played or missed).
 * The input is told the notes to listen for and the accompaniment the app plays. Notes are marked for
 * the renderer (`marks`, one byte per note of the timeline) and the score kept in the store, once per
 * chord. `now` is the input's clock (seconds).
 */
export function createPianoMode(
  engine: PlayerEngine,
  store: PlayerStore,
  now: () => number = () => performance.now() / 1000,
) {
  const marks = new Uint8Array(engine.timeline.notes.length);
  let input: InputSource | null = null;
  let waitTracker: WaitTracker | null = null;
  let rhythmTracker: RhythmTracker | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;
  let listening: readonly number[] | null = null;
  /** When playback stopped at the gate (wait mode), null while it plays. */
  let waitingSince: number | null = null;

  const practised = () => HANDS[store.getState().piano.hands];

  /** Notes of the other hands the app plays between `from` and `to`: known sounds for the microphone. */
  const accompaniment = (from: number, to: number): number[] => {
    const hands = practised();
    const notes = notesInWindow(engine.timeline, from, to).filter((note) => !hands.includes(note.hand));
    return [...new Set(notes.map((note) => note.pitch))];
  };

  const listenFor = (pitches: readonly number[], around: number) => {
    if (!sameNotes(pitches, listening)) {
      listening = pitches;
      input?.expect(pitches, accompaniment(around - ACCOMPANIMENT_S, around + ACCOMPANIMENT_S));
    }
  };

  const score = (good: boolean) => {
    const current: PianoScore = store.getState().pianoScore ?? { chords: 0, good: 0 };
    store.setState({ pianoScore: { chords: current.chords + 1, good: current.good + (good ? 1 : 0) } });
  };

  const mark = (point: WaitPoint, value: number) => {
    for (const index of point.noteIndexes) {
      marks[index] = value;
    }
  };

  const judged = (judgement: Judgement) => {
    mark(judgement.point, judgement.verdict === "hit" ? NOTE_PLAYED : NOTE_MISSED);
    score(judgement.verdict === "hit");
  };

  const tickWait = (tracker: WaitTracker) => {
    tracker.update(engine.position, engine.clock.rate, now());
    const point = tracker.current;
    if (point && tracker.satisfied) {
      const waited = waitingSince === null ? 0 : now() - waitingSince;
      mark(point, NOTE_PLAYED);
      score(waited <= ON_TIME_WAIT_S);
      waitingSince = null;
      tracker.advance();
      engine.setGate(tracker.current?.time ?? null);
      engine.release();
    }
    const next = tracker.current;
    listenFor(next?.pitches ?? [], next?.time ?? engine.position);
    const waitingFor = engine.isWaiting ? tracker.missing() : null;
    if (!sameNotes(waitingFor, store.getState().waitingFor)) {
      store.setState({ waitingFor });
    }
  };

  const tickRhythm = (tracker: RhythmTracker) => {
    if (!engine.isPlaying) {
      return;
    }
    for (const judgement of tracker.update(engine.position, engine.clock.rate, now())) {
      judged(judgement);
    }
    listenFor(tracker.listening(), engine.position);
  };

  const tick = () => {
    if (waitTracker) {
      tickWait(waitTracker);
    } else if (rhythmTracker) {
      tickRhythm(rhythmTracker);
    }
  };

  /** (Re)starts from the current position, with the current mode and hands. */
  const restart = () => {
    const points = waitPoints(engine.timeline.notes, practised());
    marks.fill(0);
    listening = null;
    waitingSince = null;
    store.setState({ waitingFor: null });
    if (store.getState().piano.mode === "wait") {
      rhythmTracker = null;
      waitTracker = new WaitTracker(points);
      waitTracker.seek(engine.position);
      engine.setGate(waitTracker.current?.time ?? null);
    } else {
      waitTracker = null;
      rhythmTracker = new RhythmTracker(points);
      rhythmTracker.seek(engine.position);
      engine.setGate(null);
      engine.release();
    }
    tick();
  };

  return {
    /** One byte per note of the timeline: NOTE_PLAYED, NOTE_MISSED or 0. */
    marks,

    /** Hands muted in playback: the player plays them on the real piano. */
    practisedHands(): readonly Hand[] {
      return input ? practised() : [];
    },

    enable(source: InputSource) {
      input = source;
      source.onNote = (pitch, time) => {
        if (waitTracker) {
          waitTracker.noteHeard(pitch, time);
          tick();
          return;
        }
        const judgement = rhythmTracker?.noteHeard(pitch);
        if (judgement) {
          judged(judgement);
        }
      };
      engine.onWait = () => {
        waitingSince = now();
        tick();
      };
      store.setState({ pianoScore: { chords: 0, good: 0 } });
      restart();
      timer = setInterval(tick, PIANO_TICK_MS);
    },

    /** The input is closed by the caller (it opened it). */
    disable() {
      clearInterval(timer);
      timer = undefined;
      if (input) {
        input.onNote = null;
      }
      input = null;
      waitTracker = null;
      rhythmTracker = null;
      marks.fill(0);
      engine.onWait = () => undefined;
      engine.setGate(null);
      engine.release();
      store.setState({ waitingFor: null, pianoScore: null });
    },

    /** Other mode or hands: the score starts again (a new session). */
    settingsChanged() {
      if (input) {
        store.setState({ pianoScore: { chords: 0, good: 0 } });
        restart();
      }
    },

    /** Playback moved (seek, loop, end): the next chord is the first from there. */
    moved() {
      if (input) {
        restart();
      }
    },
  };
}

export type PianoMode = ReturnType<typeof createPianoMode>;
