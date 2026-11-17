import type { Loop } from "@open-keys/contracts";
import { useEffect, useRef } from "react";
import { useSaveLoop } from "../../practice";
import type { LoopSelection, PlayerStore } from "../stores/player.store";

function progressChanged(current: LoopSelection, saved: Loop): boolean {
  return current.bestTempoPct !== saved.bestTempoPct || current.targetTempoPct !== saved.targetTempoPct;
}

/**
 * Saves the best and target speeds of the current loop once it is saved (UC-26): the controller updates
 * them in the store, this hook writes them like any other loop change (offline-capable outbox).
 */
export function useLoopProgress(store: PlayerStore, savedLoops: readonly Loop[]): void {
  const saveLoop = useSaveLoop();
  const save = useRef(saveLoop.mutate);
  save.current = saveLoop.mutate;

  useEffect(
    () =>
      store.subscribe((state, previous) => {
        const loop = state.loop;
        if (!loop?.id || loop === previous.loop) {
          return;
        }
        const saved = savedLoops.find((candidate) => candidate.id === loop.id);
        if (!(saved && progressChanged(loop, saved))) {
          return;
        }
        const { id, ...fields } = saved;
        save.current({
          id,
          loop: {
            ...fields,
            bestTempoPct: loop.bestTempoPct,
            targetTempoPct: loop.targetTempoPct,
            updatedAt: Date.now(),
          },
        });
      }),
    [store, savedLoops],
  );
}
