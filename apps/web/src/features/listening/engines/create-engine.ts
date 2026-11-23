import { createDspEngine } from "./dsp-engine";
import type { EngineKind, EngineOptions, ListeningEngine } from "./listening-engine";

/** The engine `kind`: Basic Pitch is loaded on demand (its own chunk, about 3 MB with its model). */
export async function createEngine(kind: EngineKind, options: EngineOptions): Promise<ListeningEngine> {
  if (kind === "dsp") {
    return createDspEngine(options);
  }
  const { createBasicPitchEngine } = await import("./basic-pitch-engine");
  return createBasicPitchEngine(options);
}
