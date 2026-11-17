import * as tonejsMidi from "@tonejs/midi";

type TonejsMidiModule = typeof tonejsMidi;

/**
 * @tonejs/midi ships a UMD build for Node ("main", no detectable named ESM exports: Node only exposes
 * `default`) and an ESM build for bundlers ("module", named exports, no default). Support both, so the
 * same code runs under Vite/Vitest, the production bundle and plain Node (tsx).
 */
const resolved: TonejsMidiModule =
  "Midi" in tonejsMidi && tonejsMidi.Midi !== undefined
    ? tonejsMidi
    : // Node's CommonJS interop: the whole module.exports object is the default export.
      (tonejsMidi as unknown as { default: TonejsMidiModule }).default;

export const Midi = resolved.Midi;
export type Midi = InstanceType<typeof Midi>;
export type { Track } from "@tonejs/midi";
