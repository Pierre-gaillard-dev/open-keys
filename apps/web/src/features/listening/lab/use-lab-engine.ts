import { useEffect, useRef, useState } from "react";
import { createEngine } from "../engines/create-engine";
import type { EngineFrame, EngineKind, ListeningEngine, Sensitivity } from "../engines/listening-engine";

export type EngineStatus = "idle" | "loading" | "ready" | "error";

/**
 * The engine of the lab, (re)created when the microphone opens or a setting changes, expecting
 * `expected`. `onFrame` and `expected` may change between renders: the latest ones are used.
 */
export function useLabEngine(
  kind: EngineKind,
  sensitivity: Sensitivity,
  sampleRate: number | null,
  expected: readonly number[],
  onFrame: (frame: EngineFrame) => void,
) {
  const expectedRef = useRef(expected);
  expectedRef.current = expected;
  const engine = useRef<ListeningEngine | null>(null);
  const frameHandler = useRef(onFrame);
  frameHandler.current = onFrame;
  const [status, setStatus] = useState<EngineStatus>("idle");
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (sampleRate === null) {
      setStatus("idle");
      return;
    }
    let cancelled = false;
    let created: ListeningEngine | null = null;
    setStatus("loading");
    setError(null);
    createEngine(kind, { sampleRate, sensitivity, onFrame: (frame) => frameHandler.current(frame) })
      .then((ready) => {
        if (cancelled) {
          ready.dispose();
          return;
        }
        created = ready;
        ready.expect(expectedRef.current);
        engine.current = ready;
        setStatus("ready");
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause);
          setStatus("error");
        }
      });
    return () => {
      cancelled = true;
      created?.dispose();
      engine.current = null;
    };
  }, [kind, sensitivity, sampleRate]);

  return { engine, status, error };
}
