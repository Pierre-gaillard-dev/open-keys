import { Gauge, X } from "lucide-react";
import { useStore } from "zustand";
import type { PlayerController } from "../controller/player-controller";
import type { PlayerStore } from "../stores/player.store";

/**
 * "5 tours à 70 % — Passer à 75 % ?" (UC-26). Stays visible while the controls are hidden: it appears
 * during practice, between two turns of the loop.
 */
export function SpeedUpOffer({
  store,
  controller,
}: {
  readonly store: PlayerStore;
  readonly controller: PlayerController | null;
}) {
  const offer = useStore(store, (state) => state.speedUpOffer);
  const runs = useStore(store, (state) => state.loopRuns);
  const tempoPct = useStore(store, (state) => state.tempoPct);
  if (offer === null) {
    return null;
  }
  return (
    <section
      aria-label="Proposition d'accélérer"
      className="absolute top-20 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-line bg-surface/95 py-2 pr-2 pl-4 text-sm shadow-2xl shadow-black/60"
    >
      <Gauge aria-hidden="true" className="size-4 shrink-0 text-hand-right" />
      <p>
        {runs} tours à {tempoPct} %. <span className="font-semibold">Passer à {offer} % ?</span>
      </p>
      <button
        type="button"
        onClick={() => controller?.acceptSpeedUp()}
        className="h-9 rounded-xl bg-fg px-3 font-semibold text-bg"
      >
        Accélérer
      </button>
      <button
        type="button"
        aria-label="Plus tard"
        onClick={() => controller?.dismissSpeedUp()}
        className="flex size-9 items-center justify-center rounded-xl text-fg-muted hover:text-fg"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </section>
  );
}
