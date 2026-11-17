import type { Timeline } from "@open-keys/core";
import { type RefObject, useEffect, useState } from "react";
import { createPlayerController, type PlayerController } from "../controller/player-controller";
import { PlayerEngine } from "../engine/player-engine";
import { SessionTracker } from "../practice/session-tracker";
import type { PlayerRuntime } from "../runtime/browser-runtime";
import { createPlayerStore, type InitialPlayerState, type PlayerStore } from "../stores/player.store";
import type { SamplesStatus } from "./use-player-runtime";

export interface PlayerSession {
  readonly store: PlayerStore;
  readonly tracker: SessionTracker;
  /** Null until the engine exists (first effect run). */
  readonly controller: PlayerController | null;
}

/**
 * Creates the engine, controller and renderer of one song on the given runtime, and tears them down on
 * unmount (React strict mode mounts twice: each run is fully cleaned up). Ready once the samples are.
 */
export function usePlayerSession(
  timeline: Timeline,
  initial: InitialPlayerState,
  host: RefObject<HTMLElement | null>,
  runtime: PlayerRuntime,
  samples: SamplesStatus,
): PlayerSession {
  const [store] = useState(() => createPlayerStore(initial));
  const [tracker] = useState(() => new SessionTracker());
  const [controller, setController] = useState<PlayerController | null>(null);

  useEffect(() => {
    const engine = new PlayerEngine(timeline, runtime.audio, runtime.output);
    const instance = createPlayerController(engine, store, tracker);
    const { hands, zoom } = store.getState();
    const renderer = runtime.createRenderer(timeline, engine.clock, {
      visibleHands: { left: hands.left.visible, right: hands.right.visible },
      zoom,
    });
    let disposed = false;

    const element = host.current;
    if (element) {
      renderer
        .init(element)
        .then(() => {
          if (disposed) {
            renderer.destroy();
          } else {
            instance.attachRenderer(renderer);
          }
        })
        .catch(() =>
          store.setState({ status: "error", error: "Le rendu graphique (WebGL) n'est pas disponible." }),
        );
    }
    setController(instance);

    return () => {
      disposed = true;
      instance.dispose();
      renderer.destroy();
      setController(null);
    };
  }, [timeline, store, tracker, host, runtime]);

  useEffect(() => {
    if (store.getState().status !== "loading") {
      return;
    }
    if (samples === "ready") {
      store.setState({ status: "ready" });
    } else if (samples === "error") {
      store.setState({ status: "error", error: "Les sons du piano n'ont pas pu être chargés." });
    }
  }, [samples, store]);

  return { store, tracker, controller };
}
