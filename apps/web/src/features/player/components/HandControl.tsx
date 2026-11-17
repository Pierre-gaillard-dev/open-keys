import type { Hand } from "@open-keys/core";
import { Eye, EyeOff, Volume2, VolumeX } from "lucide-react";
import { useStore } from "zustand";
import { cx } from "../../../shared/lib/cx";
import type { PlayerController } from "../controller/player-controller";
import type { PlayerStore } from "../stores/player.store";

const LABELS: Readonly<Record<Hand, string>> = { left: "gauche", right: "droite" };

/** Sound and display of one hand, independently (UC-11). */
export function HandControl({
  hand,
  store,
  controller,
}: {
  readonly hand: Hand;
  readonly store: PlayerStore;
  readonly controller: PlayerController | null;
}) {
  const settings = useStore(store, (state) => state.hands[hand]);
  const name = LABELS[hand];
  const toggleClass = (on: boolean) =>
    cx("flex size-10 items-center justify-center rounded-lg", on ? "bg-line text-fg" : "text-fg-muted");

  return (
    <div className="flex h-12 items-center gap-1 rounded-xl bg-surface-2 pr-1 pl-3">
      <span
        aria-hidden="true"
        className={cx("size-2.5 rounded-sm", hand === "left" ? "bg-hand-left" : "bg-hand-right")}
      />
      <span className="mr-1 ml-1.5 text-sm font-semibold capitalize">{name}</span>
      <button
        type="button"
        aria-pressed={settings.audible}
        aria-label={`Son de la main ${name}`}
        disabled={!controller}
        onClick={() => controller?.toggleHand(hand, "audible")}
        className={toggleClass(settings.audible)}
      >
        {settings.audible ? (
          <Volume2 aria-hidden="true" className="size-4.5" />
        ) : (
          <VolumeX aria-hidden="true" className="size-4.5" />
        )}
      </button>
      <button
        type="button"
        aria-pressed={settings.visible}
        aria-label={`Affichage de la main ${name}`}
        disabled={!controller}
        onClick={() => controller?.toggleHand(hand, "visible")}
        className={toggleClass(settings.visible)}
      >
        {settings.visible ? (
          <Eye aria-hidden="true" className="size-4.5" />
        ) : (
          <EyeOff aria-hidden="true" className="size-4.5" />
        )}
      </button>
    </div>
  );
}
