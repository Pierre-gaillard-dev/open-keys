import { useStore } from "zustand";
import type { PlayerStore } from "../stores/player.store";

/** "4, 3, 2, 1" in the middle of the screen during a count-in (UC-22), above the falling notes. */
export function CountInBadge({ store }: { readonly store: PlayerStore }) {
  const beatsLeft = useStore(store, (state) => state.countInBeatsLeft);
  return (
    <div
      role="status"
      aria-live="assertive"
      className="pointer-events-none absolute inset-x-0 top-1/3 flex justify-center"
    >
      {beatsLeft !== null && (
        <span
          key={beatsLeft}
          className="font-display text-8xl font-bold text-fg/90 drop-shadow-[0_4px_24px_rgba(0,0,0,0.8)]"
        >
          <span className="sr-only">Décompte : </span>
          {beatsLeft}
        </span>
      )}
    </div>
  );
}
