import { useEffect, useState } from "react";
import { createBrowserRuntime, type PlayerRuntime } from "../runtime/browser-runtime";

export type SamplesStatus = "loading" | "ready" | "error";

export interface PlayerRuntimeState {
  /** Null until the first effect run. */
  readonly runtime: PlayerRuntime | null;
  readonly samples: SamplesStatus;
}

/**
 * Creates the audio runtime as soon as the player opens: decoding the piano samples (the longest step of
 * the startup) runs while the song is still loading. Closed when leaving the player.
 */
export function usePlayerRuntime(): PlayerRuntimeState {
  const [state, setState] = useState<PlayerRuntimeState>({ runtime: null, samples: "loading" });

  useEffect(() => {
    const runtime = createBrowserRuntime();
    let disposed = false;
    setState({ runtime, samples: "loading" });
    runtime.loadSamples().then(
      () => !disposed && setState({ runtime, samples: "ready" }),
      () => !disposed && setState({ runtime, samples: "error" }),
    );
    return () => {
      disposed = true;
      runtime.close();
    };
  }, []);

  return state;
}
