import { useEffect } from "react";
import type { PlayerStore } from "../stores/player.store";
import { savePlayerPreferences } from "../stores/player-preferences";

/** Keeps the device preferences (count-in, metronome, note names) for the next songs. */
export function useSavePreferences(store: PlayerStore): void {
  useEffect(
    () =>
      store.subscribe((state, previous) => {
        if (state.preferences !== previous.preferences) {
          savePlayerPreferences(state.preferences);
        }
      }),
    [store],
  );
}
