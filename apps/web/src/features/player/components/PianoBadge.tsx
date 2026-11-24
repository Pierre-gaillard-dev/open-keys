import { midiToNoteName } from "@open-keys/core";
import { useStore } from "zustand";
import type { PlayerStore } from "../stores/player.store";

/** Wait mode: the notes of the chord awaited that the microphone has not heard yet. */
export function WaitBadge({ store }: { readonly store: PlayerStore }) {
  const waitingFor = useStore(store, (state) => state.waitingFor);
  const naming = useStore(store, (state) => state.noteNaming);
  return (
    <div role="status" className="pointer-events-none absolute inset-x-0 top-20 flex justify-center">
      {waitingFor && waitingFor.length > 0 && (
        <span className="rounded-full bg-surface/90 px-4 py-2 text-sm font-semibold shadow-lg shadow-black/40">
          À toi : {waitingFor.map((pitch) => midiToNoteName(pitch, naming)).join(" · ")}
        </span>
      )}
    </div>
  );
}
