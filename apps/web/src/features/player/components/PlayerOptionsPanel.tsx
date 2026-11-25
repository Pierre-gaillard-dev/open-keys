import { Minus, Plus, X } from "lucide-react";
import { useStore } from "zustand";
import { cx } from "../../../shared/lib/cx";
import { IconButton, SegmentedControl } from "../../../shared/ui";
import { createMicrophoneInput } from "../../listening";
import {
  MAX_TEMPO_PCT,
  MIN_TEMPO_PCT,
  type PlayerController,
  TEMPO_STEP_PCT,
} from "../controller/player-controller";
import type { PianoHands, PianoMode, PlayerStore, SoundSource } from "../stores/player.store";
import type { NoteNamesMode } from "../stores/player-preferences";
import { HandControl } from "./HandControl";

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

const SOUND_OPTIONS: readonly { value: SoundSource; label: string }[] = [
  { value: "piano", label: "Piano" },
  { value: "recording", label: "Enregistrement" },
];

const PIANO_MODE_OPTIONS: readonly { value: PianoMode; label: string }[] = [
  { value: "wait", label: "Attendre chaque accord" },
  { value: "rhythm", label: "En rythme" },
];

const PIANO_HANDS_OPTIONS: readonly { value: PianoHands; label: string }[] = [
  { value: "left", label: "Main gauche" },
  { value: "right", label: "Main droite" },
  { value: "both", label: "Les deux" },
];

const SECTION = "flex flex-col gap-2 border-t border-line pt-4";
const SECTION_TITLE = "text-xs font-semibold tracking-wide text-fg-muted uppercase";
const STEP_BUTTON = "flex size-10 items-center justify-center rounded-lg bg-surface-2 disabled:opacity-40";

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

function SpeedControl({ store, controller }: Omit<PlayerOptionsPanelProps, "onClose">) {
  const tempoPct = useStore(store, (state) => state.tempoPct);
  return (
    <fieldset className="m-0 flex items-center gap-3 border-0 p-0">
      <legend className={cx(SECTION_TITLE, "mb-2")}>Vitesse</legend>
      <button
        type="button"
        aria-label="Ralentir"
        disabled={!controller || tempoPct <= MIN_TEMPO_PCT}
        onClick={() => controller?.changeTempo(-TEMPO_STEP_PCT)}
        className={STEP_BUTTON}
      >
        <Minus aria-hidden="true" className="size-4" />
      </button>
      <output aria-live="polite" className="min-w-16 text-center text-lg font-bold tabular-nums">
        {tempoPct} %
      </output>
      <button
        type="button"
        aria-label="Accélérer"
        disabled={!controller || tempoPct >= MAX_TEMPO_PCT}
        onClick={() => controller?.changeTempo(TEMPO_STEP_PCT)}
        className={STEP_BUTTON}
      >
        <Plus aria-hidden="true" className="size-4" />
      </button>
    </fieldset>
  );
}

/**
 * Everything that is set once and left alone while playing: speed, hands (per song), zoom, note names,
 * count-in and metronome (device preferences). Scrolls on a phone in landscape.
 */
export function PlayerOptionsPanel({ store, controller, onClose }: PlayerOptionsPanelProps) {
  const preferences = useStore(store, (state) => state.preferences);
  const zoom = useStore(store, (state) => state.zoom);

  return (
    <section
      aria-label="Réglages du lecteur"
      className="flex max-h-[calc(100dvh-7.5rem-clamp(56px,20dvh,170px))] [@media(max-height:500px)]:max-h-[calc(100dvh-1rem)] w-[23rem] max-w-[calc(100vw-1.5rem)] flex-col gap-4 overflow-y-auto overscroll-contain rounded-2xl border border-line bg-surface p-4 shadow-2xl shadow-black/60"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Réglages</h2>
        <IconButton label="Fermer" onClick={onClose} className="size-9">
          <X aria-hidden="true" className="size-4" />
        </IconButton>
      </div>

      <SpeedControl store={store} controller={controller} />

      <SoundSection store={store} controller={controller} />

      <PianoSection store={store} controller={controller} />

      <div className={SECTION}>
        <h3 className={SECTION_TITLE}>Mains</h3>
        <HandControl hand="left" store={store} controller={controller} />
        <HandControl hand="right" store={store} controller={controller} />
      </div>

      <div className={SECTION}>
        <h3 className={SECTION_TITLE}>Affichage</h3>
        <Toggle
          label="Zoom sur le morceau"
          hint="Le clavier se limite aux notes jouées"
          pressed={zoom}
          onToggle={() => controller?.toggleZoom()}
        />
        <span className="text-sm font-semibold">Nom des notes</span>
        <SegmentedControl
          label="Nom des notes"
          options={NOTE_NAMES_OPTIONS}
          value={preferences.noteNames}
          onChange={(value) => controller?.setNoteNames(value)}
        />
      </div>

      <div className={SECTION}>
        <h3 className={SECTION_TITLE}>Rythme</h3>
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
    </section>
  );
}

/** Playing on the piano (V1.5): the microphone listens; playback waits for each chord, or judges it. */
function PianoSection({
  store,
  controller,
}: {
  readonly store: PlayerStore;
  readonly controller: PlayerController | null;
}) {
  const piano = useStore(store, (state) => state.piano);
  const on = piano.status === "on" || piano.status === "starting";
  const toggle = () => {
    if (on) {
      void controller?.stopPiano();
    } else {
      void controller?.startPiano(() => createMicrophoneInput());
    }
  };
  return (
    <div className={SECTION}>
      <h3 className={SECTION_TITLE}>Jouer au piano</h3>
      <Toggle
        label="Écouter mon piano"
        hint={piano.status === "starting" ? "Ouverture du micro…" : "Le micro entend ce que tu joues"}
        pressed={on}
        onToggle={toggle}
      />
      <SegmentedControl
        label="Façon de jouer"
        options={PIANO_MODE_OPTIONS}
        value={piano.mode}
        onChange={(mode) => controller?.setPianoMode(mode)}
      />
      <p className="text-xs text-fg-muted">
        {piano.mode === "wait"
          ? "La lecture s'arrête à chaque accord jusqu'à l'entendre."
          : "La lecture continue : chaque accord devient vert s'il est joué à temps, rouge sinon."}
      </p>
      <span className="text-sm font-semibold">Je joue</span>
      <SegmentedControl
        label="Mains jouées au piano"
        options={PIANO_HANDS_OPTIONS}
        value={piano.hands}
        onChange={(hands) => controller?.setPianoHands(hands)}
      />
      <p className="text-xs text-fg-muted">
        Ces mains sont coupées dans la lecture : c'est toi qui les joues, et le micro ne doit pas entendre
        l'app les jouer.
      </p>
      {piano.status === "error" && (
        <p role="alert" className="text-sm text-danger">
          Micro indisponible : autorise-le dans le navigateur, puis réessaie.
          {piano.error && <span className="block text-xs text-fg-muted">{piano.error}</span>}
        </p>
      )}
    </div>
  );
}

/** The original recording of the song (D35), when it has one, instead of the app's piano. */
function SoundSection({
  store,
  controller,
}: {
  readonly store: PlayerStore;
  readonly controller: PlayerController | null;
}) {
  const available = useStore(store, (state) => state.recordingAvailable);
  const sound = useStore(store, (state) => state.sound);
  const failed = useStore(store, (state) => state.recordingError);
  const pianoOn = useStore(
    store,
    (state) => state.piano.status === "on" || state.piano.status === "starting",
  );
  if (!available) {
    return null;
  }
  return (
    <div className={SECTION}>
      <h3 className={SECTION_TITLE}>Son</h3>
      <SegmentedControl
        label="Son"
        options={SOUND_OPTIONS}
        value={sound}
        onChange={(value) => controller?.setSound(value)}
        disabled={pianoOn}
      />
      <p className="text-xs text-fg-muted">
        {pianoOn
          ? "Pas d'enregistrement en jouant au piano : le micro l'entendrait."
          : "Enregistrement : le morceau d'origine, calé sur les notes, au ralenti sans changer le ton."}
      </p>
      {failed && (
        <p role="alert" className="text-sm text-danger">
          Enregistrement indisponible : retour au piano.
        </p>
      )}
    </div>
  );
}
