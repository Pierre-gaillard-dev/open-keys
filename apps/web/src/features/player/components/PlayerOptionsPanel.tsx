import type { Hand } from "@open-keys/core";
import { X } from "lucide-react";
import { useStore } from "zustand";
import { cx } from "../../../shared/lib/cx";
import { IconButton, SegmentedControl } from "../../../shared/ui";
import type { PlayerController } from "../controller/player-controller";
import type { PlayerStore } from "../stores/player.store";
import type { NoteNamesMode } from "../stores/player-preferences";

export interface PlayerOptionsPanelProps {
  readonly store: PlayerStore;
  readonly controller: PlayerController | null;
  readonly onClose: () => void;
}

const NOTE_NAMES_OPTIONS: readonly { value: NoteNamesMode; label: string }[] = [
  { value: "off", label: "Aucun" },
  { value: "notes", label: "Notes" },
  { value: "keys", label: "Touches" },
  { value: "both", label: "Les deux" },
];

const HAND_LABELS: Readonly<Record<Hand, string>> = { left: "Main gauche", right: "Main droite" };

function Toggle({
  label,
  hint,
  pressed,
  onToggle,
}: {
  readonly label: string;
  readonly hint: string;
  readonly pressed: boolean;
  readonly onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onToggle}
      className="flex items-center justify-between gap-3 rounded-xl px-1 py-1.5 text-left"
    >
      <span className="flex flex-col">
        <span className="text-sm font-semibold">{label}</span>
        <span className="text-xs text-fg-muted">{hint}</span>
      </span>
      <span
        aria-hidden="true"
        className={cx(
          "flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 transition-colors",
          pressed ? "justify-end bg-hand-left" : "justify-start bg-surface-2",
        )}
      >
        <span className="size-5 rounded-full bg-fg" />
      </span>
    </button>
  );
}

/** Count-in, metronome, note names (device preferences) and volume of each hand (per song). */
export function PlayerOptionsPanel({ store, controller, onClose }: PlayerOptionsPanelProps) {
  const preferences = useStore(store, (state) => state.preferences);
  const hands = useStore(store, (state) => state.hands);

  return (
    <section
      aria-label="Réglages du lecteur"
      className="flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col gap-4 rounded-2xl border border-line bg-surface p-4 shadow-2xl shadow-black/60"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Réglages</h2>
        <IconButton label="Fermer" onClick={onClose} className="size-9">
          <X aria-hidden="true" className="size-4" />
        </IconButton>
      </div>

      <div className="flex flex-col gap-1">
        <Toggle
          label="Décompte"
          hint="Une mesure avant de jouer et à chaque tour de boucle"
          pressed={preferences.countIn}
          onToggle={() => controller?.toggleCountIn()}
        />
        <Toggle
          label="Métronome"
          hint="Temps fort accentué"
          pressed={preferences.metronome}
          onToggle={() => controller?.toggleMetronome()}
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold">Nom des notes</span>
        <SegmentedControl
          label="Nom des notes"
          options={NOTE_NAMES_OPTIONS}
          value={preferences.noteNames}
          onChange={(value) => controller?.setNoteNames(value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold">Volume</span>
        {(["left", "right"] as const).map((hand) => (
          <label key={hand} className="flex items-center gap-3 text-sm text-fg-soft">
            <span className={cx("w-24 shrink-0", hand === "left" ? "text-hand-left" : "text-hand-right")}>
              {HAND_LABELS[hand]}
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              aria-label={`Volume ${HAND_LABELS[hand].toLowerCase()}`}
              value={Math.round(hands[hand].volume * 100)}
              onChange={(event) => controller?.setHandVolume(hand, Number(event.target.value))}
              className={cx("flex-1", hand === "left" ? "accent-hand-left" : "accent-hand-right")}
            />
            <output className="w-12 text-right whitespace-nowrap tabular-nums">
              {Math.round(hands[hand].volume * 100)} %
            </output>
          </label>
        ))}
      </div>
    </section>
  );
}
