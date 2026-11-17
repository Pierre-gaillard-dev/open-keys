import { useCallback, useEffect, useRef, useState } from "react";
import type { PlayerEngine } from "../engine/player-engine";
import type { PreviewSession } from "./preview-session";

/** The audio engine is downloaded at the first preview, not with the page. */
const loadSession = () => import("./preview-session").then((module) => module.createPreviewSession());

export interface PreviewState {
  /** What is being previewed (a Mutopia piece id…). */
  readonly key: string;
  /** Loading: MIDI download and, the first time, piano samples. */
  readonly status: "loading" | "playing";
}

export interface MidiPreview {
  readonly current: PreviewState | null;
  readonly error: unknown;
  /** Plays `key` (stopping any other preview), or stops it if it is the one playing. */
  toggle(key: string, loadMidi: () => Promise<Uint8Array>): void;
}

/**
 * Listening to a MIDI file before importing it (UC-20): the player's audio engine, without the
 * falling notes. One preview at a time; the engine is loaded and the audio context created on the first
 * click (the browser allows the audio to start), and closed when leaving the page.
 */
export function useMidiPreview(): MidiPreview {
  const [current, setCurrent] = useState<PreviewState | null>(null);
  const [error, setError] = useState<unknown>(null);
  const session = useRef<Promise<PreviewSession> | null>(null);
  const engine = useRef<PlayerEngine | null>(null);
  /** Incremented by every toggle: a slow load that was superseded is dropped. */
  const generation = useRef(0);
  const currentKey = useRef<string | null>(null);

  const stop = useCallback(() => {
    generation.current++;
    engine.current?.dispose();
    engine.current = null;
    currentKey.current = null;
    setCurrent(null);
  }, []);

  useEffect(
    () => () => {
      engine.current?.dispose();
      void session.current?.then((opened) => opened.close());
    },
    [],
  );

  const start = useCallback(
    async (key: string, loadMidi: () => Promise<Uint8Array>) => {
      const id = generation.current;
      currentKey.current = key;
      setError(null);
      setCurrent({ key, status: "loading" });
      try {
        session.current ??= loadSession();
        const [bytes, opened] = await Promise.all([loadMidi(), session.current]);
        await opened.ready;
        if (id !== generation.current) {
          return;
        }
        const preview = opened.engineFor(bytes);
        preview.onEnd = () => {
          if (engine.current === preview) {
            stop();
          }
        };
        engine.current = preview;
        await preview.play();
        if (id === generation.current) {
          setCurrent({ key, status: "playing" });
        }
      } catch (cause) {
        if (id === generation.current) {
          stop();
          setError(cause);
        }
      }
    },
    [stop],
  );

  const toggle = useCallback(
    (key: string, loadMidi: () => Promise<Uint8Array>) => {
      const same = currentKey.current === key;
      stop();
      if (!same) {
        void start(key, loadMidi);
      }
    },
    [start, stop],
  );

  return { current, error, toggle };
}
