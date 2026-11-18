import type { SongTrack } from "@open-keys/contracts";
import { midiToNoteName, type TrackHand } from "@open-keys/core";
import { Minus, Plus } from "lucide-react";
import { cx } from "../../../shared/lib/cx";
import { IconButton, SegmentedControl } from "../../../shared/ui";
import type { HandsChoice } from "../hands-assignment";

const HAND_STYLES: Readonly<Record<TrackHand, string>> = {
  left: "border-hand-left text-hand-left",
  right: "border-hand-right text-hand-right",
  ignore: "border-fg-soft text-fg",
};

const HAND_LABELS: Readonly<Record<TrackHand, string>> = {
  left: "Gauche",
  right: "Droite",
  ignore: "Ignorer",
};

/** Per-note mode: a track is only played or ignored, its notes are split between the hands. */
const PLAYED_LABELS: Readonly<Record<TrackHand, string>> = { ...HAND_LABELS, right: "Jouée" };

const CHOICES: Readonly<Record<HandsChoice, readonly TrackHand[]>> = {
  auto: ["right", "ignore"],
  tracks: ["left", "right", "ignore"],
  split: ["right", "ignore"],
};

const LOWEST_SPLIT = 21;
const HIGHEST_SPLIT = 108;

export interface TrackHandsEditorProps {
  readonly tracks: readonly SongTrack[];
  readonly mode: HandsChoice;
  readonly splitPitch: number;
  readonly hands: Readonly<Record<string, TrackHand>>;
  readonly onModeChange: (mode: HandsChoice) => void;
  readonly onSplitPitchChange: (pitch: number) => void;
  readonly onHandChange: (trackId: string, hand: TrackHand) => void;
}

function HandChoice({
  track,
  hand,
  choices,
  labels,
  onChange,
}: {
  readonly track: SongTrack;
  readonly hand: TrackHand;
  readonly choices: readonly TrackHand[];
  readonly labels: Readonly<Record<TrackHand, string>>;
  readonly onChange: (hand: TrackHand) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={`Main de la piste ${track.name ?? track.trackIndex}`}
      className="grid gap-1.5"
      style={{ gridTemplateColumns: `repeat(${choices.length}, minmax(0, 1fr))` }}
    >
      {choices.map((choice) => {
        const selected = choice === hand;
        return (
          // biome-ignore lint/a11y/useSemanticElements: ARIA radio pattern rendered as buttons
          <button
            key={choice}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(choice)}
            className={cx(
              "h-11 rounded-xl border text-sm transition-colors",
              selected
                ? `bg-surface-2 font-semibold ${HAND_STYLES[choice]}`
                : "border-line text-fg-muted hover:text-fg",
            )}
          >
            {labels[choice]}
          </button>
        );
      })}
    </div>
  );
}

/** Hand assignment (UC-04): note by note (D28), by track, or by pitch around a split note. */
export function TrackHandsEditor(props: TrackHandsEditorProps) {
  const { tracks, mode, splitPitch, hands, onModeChange, onSplitPitchChange, onHandChange } = props;
  const changeSplit = (delta: number) =>
    onSplitPitchChange(Math.min(HIGHEST_SPLIT, Math.max(LOWEST_SPLIT, splitPitch + delta)));

  return (
    <div className="flex flex-col gap-3">
      <SegmentedControl<HandsChoice>
        label="Mode de répartition"
        options={[
          { value: "auto", label: "Note par note" },
          { value: "tracks", label: "Par piste" },
          { value: "split", label: "Par hauteur" },
        ]}
        value={mode}
        onChange={onModeChange}
      />
      {mode === "auto" && (
        <p className="text-xs text-fg-muted">
          Chaque note va à la main qui la jouerait le plus naturellement (position des mains, écarts,
          croisements). Les pistes servent seulement à choisir ce qui est joué.
        </p>
      )}
      {mode === "split" && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-3">
          <p className="text-sm text-fg-soft">
            Notes à partir de <strong className="text-fg">{midiToNoteName(splitPitch)}</strong> à droite, en
            dessous à gauche.
          </p>
          <div className="flex gap-1.5">
            <IconButton label="Descendre la séparation d'un demi-ton" onClick={() => changeSplit(-1)}>
              <Minus aria-hidden="true" className="size-4" />
            </IconButton>
            <IconButton label="Monter la séparation d'un demi-ton" onClick={() => changeSplit(1)}>
              <Plus aria-hidden="true" className="size-4" />
            </IconButton>
          </div>
        </div>
      )}
      {mode === "tracks" && (
        <p className="text-xs text-fg-muted">Proposition automatique : la piste la plus aiguë va à droite.</p>
      )}
      <ul className="flex flex-col gap-2">
        {tracks.map((track) => {
          const assigned = hands[track.id] ?? track.hand;
          const hand = mode !== "tracks" && assigned !== "ignore" ? "right" : assigned;
          return (
            <li
              key={track.id}
              className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface p-3"
            >
              <div className="flex flex-col">
                <span className="font-semibold">
                  Piste {track.trackIndex}
                  {track.name ? ` · « ${track.name} »` : ""}
                </span>
                <span className="text-xs text-fg-muted">
                  canal {track.channel + 1} · {track.noteCount} notes · {midiToNoteName(track.minPitch)} –{" "}
                  {midiToNoteName(track.maxPitch)}
                </span>
              </div>
              <HandChoice
                track={track}
                hand={hand}
                choices={CHOICES[mode]}
                labels={mode === "auto" ? PLAYED_LABELS : HAND_LABELS}
                onChange={(next) => onHandChange(track.id, next)}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
