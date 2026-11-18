import type { Hand } from "@open-keys/core";
import { Eye, EyeOff, Volume2, VolumeX } from "lucide-react";
import { useStore } from "zustand";
import { cx } from "../../../shared/lib/cx";
import type { PlayerController } from "../controller/player-controller";
import type { PlayerStore } from "../stores/player.store";

const LABELS: Readonly<Record<Hand, string>> = { left: "gauche", right: "droite" };

/** Sound, display and volume of one hand, independently (UC-11), in the player settings. */
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
  const volumePct = Math.round(settings.volume * 100);
  const toggleClass = (on: boolean) =>
    cx(
      "flex size-10 shrink-0 items-center justify-center rounded-lg",
      on ? "bg-surface-2 text-fg" : "text-fg-muted",
    );

  return (
    <div className="flex items-center gap-1">
      <span
        aria-hidden="true"
        className={cx("size-2.5 shrink-0 rounded-sm", hand === "left" ? "bg-hand-left" : "bg-hand-right")}
      />
      <span className="mr-1 ml-1.5 w-14 shrink-0 text-sm font-semibold capitalize">{name}</span>
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
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        aria-label={`Volume main ${name}`}
        value={volumePct}
        disabled={!(controller && settings.audible)}
        onChange={(event) => controller?.setHandVolume(hand, Number(event.target.value))}
        className={cx(
          "ml-2 min-w-0 flex-1 disabled:opacity-40",
          hand === "left" ? "accent-hand-left" : "accent-hand-right",
        )}
      />
      <output className="w-11 shrink-0 text-right text-sm whitespace-nowrap text-fg-soft tabular-nums">
        {volumePct} %
      </output>
    </div>
  );
}
