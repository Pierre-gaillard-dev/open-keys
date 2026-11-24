import { midiToNoteName } from "@open-keys/core";
import { useStore } from "zustand";
import type { PlayerStore } from "../stores/player.store";

/**
 * Playing on the piano: the score so far and, in wait mode, the notes of the chord awaited that the
 * microphone has not heard yet. Changes once per chord.
 */
export function PianoBadge({ store }: { readonly store: PlayerStore }) {
  const waitingFor = useStore(store, (state) => state.waitingFor);
  const score = useStore(store, (state) => state.pianoScore);
  const mode = useStore(store, (state) => state.piano.mode);
  const naming = useStore(store, (state) => state.noteNaming);
  return (
    <div className="pointer-events-none absolute inset-x-0 top-20 flex flex-col items-center gap-2">
      <div role="status">
        {waitingFor && waitingFor.length > 0 && (
          <span className="rounded-full bg-surface/90 px-4 py-2 text-sm font-semibold shadow-lg shadow-black/40">
            À toi : {waitingFor.map((pitch) => midiToNoteName(pitch, naming)).join(" · ")}
          </span>
        )}
      </div>
      {score && score.chords > 0 && (
        <span
          data-testid="piano-score"
          className="rounded-full bg-surface/80 px-3 py-1 text-xs font-semibold text-fg-soft tabular-nums"
        >
          {score.chords} accord{score.chords > 1 ? "s" : ""} · {Math.round((100 * score.good) / score.chords)}{" "}
          % {mode === "wait" ? "sans attendre" : "à temps"}
        </span>
      )}
    </div>
  );
}
