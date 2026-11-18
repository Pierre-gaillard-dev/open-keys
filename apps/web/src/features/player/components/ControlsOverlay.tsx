import type { Loop } from "@open-keys/contracts";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Maximize, Minimize, Pause, Play, Repeat, SlidersHorizontal } from "lucide-react";
import { useStore } from "zustand";
import { cx } from "../../../shared/lib/cx";
import { IconButton } from "../../../shared/ui";
import type { PlayerController } from "../controller/player-controller";
import { SEEK_STEP_MS } from "../hooks/use-player-shortcuts";
import type { PlayerStore } from "../stores/player.store";
import { LoopPanel } from "./LoopPanel";
import { PlayerOptionsPanel } from "./PlayerOptionsPanel";
import { ProgressBar } from "./ProgressBar";

export type PlayerPanel = "loops" | "options";

export interface ControlsOverlayProps {
  readonly songId: string;
  readonly title: string;
  readonly composer: string | null;
  readonly store: PlayerStore;
  readonly controller: PlayerController | null;
  readonly savedLoops: readonly Loop[];
  readonly visible: boolean;
  readonly panel: PlayerPanel | null;
  readonly onPanelChange: (panel: PlayerPanel | null) => void;
  readonly isFullscreen: boolean;
  readonly onToggleFullscreen: () => void;
}

/** Top of the keyboard: the renderer gives it 20 % of the screen, between 56 and 170 px. */
const KEYBOARD_TOP = "clamp(56px, 20%, 170px)";

/** Rows spanning the screen: only their children catch taps, the gaps let them through to the background. */
const ROW = "pointer-events-none *:pointer-events-auto";

const TOP_BUTTON = "flex h-11 items-center gap-2 rounded-xl bg-surface-2 px-3 text-sm font-semibold";

interface PanelButtonsProps {
  readonly songId: string;
  readonly store: PlayerStore;
  readonly controller: PlayerController | null;
  readonly savedLoops: readonly Loop[];
  readonly panel: PlayerPanel | null;
  readonly onPanelChange: (panel: PlayerPanel | null) => void;
}

/** Settings and loops, one panel at a time. The buttons show what is not the default. */
function PanelButtons({ songId, store, controller, savedLoops, panel, onPanelChange }: PanelButtonsProps) {
  const tempoPct = useStore(store, (state) => state.tempoPct);
  const loopEnabled = useStore(store, (state) => state.loopEnabled);
  const toggle = (next: PlayerPanel) => onPanelChange(panel === next ? null : next);
  const close = () => onPanelChange(null);
  return (
    <div className="relative flex gap-3">
      <button
        type="button"
        aria-label="Réglages du lecteur"
        aria-expanded={panel === "options"}
        onClick={() => toggle("options")}
        className={TOP_BUTTON}
      >
        <SlidersHorizontal aria-hidden="true" className="size-5" />
        {tempoPct !== 100 && (
          <span aria-hidden="true" data-testid="tempo-badge" className="tabular-nums">
            {tempoPct} %
          </span>
        )}
      </button>
      <button
        type="button"
        aria-label={`Boucles (${savedLoops.length})`}
        aria-expanded={panel === "loops"}
        onClick={() => toggle("loops")}
        className={cx(TOP_BUTTON, loopEnabled && "bg-fg text-bg")}
      >
        <Repeat aria-hidden="true" className="size-4.5" />
        <span aria-hidden="true" className="hidden sm:inline">
          Boucles
        </span>
      </button>
      {panel !== null && (
        // On a phone in landscape, a sheet on the whole height: the notes stay visible on the left.
        <div className="absolute top-13 right-0 z-10 [@media(max-height:500px)]:fixed [@media(max-height:500px)]:top-2 [@media(max-height:500px)]:right-2">
          {panel === "loops" ? (
            <LoopPanel
              songId={songId}
              store={store}
              controller={controller}
              savedLoops={savedLoops}
              onClose={close}
            />
          ) : (
            <PlayerOptionsPanel store={store} controller={controller} onClose={close} />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Controls drawn over the falling notes: the title and the panels at the top, play in the middle,
 * the progress on the edge between the notes and the keyboard. Settings live in their panels.
 */
export function ControlsOverlay(props: ControlsOverlayProps) {
  const { songId, title, composer, store, controller, savedLoops, visible, isFullscreen } = props;
  const status = useStore(store, (state) => state.status);
  const playing = status === "playing";
  const ready = controller !== null && status !== "loading" && status !== "error";

  return (
    <div
      data-player-background
      data-testid="player-controls"
      data-visible={visible}
      className={cx(
        "absolute inset-0 transition-opacity duration-200",
        visible ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <div
        data-player-background
        className="absolute inset-x-0 top-0 bg-bg/70"
        style={{ bottom: KEYBOARD_TOP }}
      />

      <header className={cx("absolute inset-x-3 top-3 flex items-center gap-3", ROW)}>
        <Link
          to="/songs/$songId"
          params={{ songId }}
          aria-label="Quitter le lecteur"
          className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-surface-2"
        >
          <ArrowLeft aria-hidden="true" className="size-5" />
        </Link>
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="truncate font-display text-base font-bold md:text-lg">{title}</h1>
          {composer && <p className="truncate text-xs text-fg-muted md:text-sm">{composer}</p>}
        </div>
        <IconButton
          label={isFullscreen ? "Quitter le plein écran" : "Plein écran"}
          onClick={props.onToggleFullscreen}
          className="shrink-0 border-0 bg-surface-2"
        >
          {isFullscreen ? (
            <Minimize aria-hidden="true" className="size-5" />
          ) : (
            <Maximize aria-hidden="true" className="size-5" />
          )}
        </IconButton>
        <PanelButtons
          songId={songId}
          store={store}
          controller={controller}
          savedLoops={savedLoops}
          panel={props.panel}
          onPanelChange={props.onPanelChange}
        />
      </header>

      <div
        className={cx("absolute inset-x-0 flex items-center justify-center gap-6", ROW)}
        style={{ top: "3.5rem", bottom: KEYBOARD_TOP }}
      >
        <button
          type="button"
          aria-label="Reculer de 5 secondes"
          disabled={!ready}
          onClick={() => controller?.seekBy(-SEEK_STEP_MS)}
          className="size-13 rounded-full bg-surface-2 text-xs font-bold disabled:opacity-40"
        >
          −5 s
        </button>
        <button
          type="button"
          aria-label={playing ? "Pause" : "Lecture"}
          disabled={!ready}
          onClick={() => void controller?.toggle()}
          className="flex size-18 items-center justify-center rounded-full bg-fg text-bg disabled:opacity-40"
        >
          {playing ? (
            <Pause aria-hidden="true" className="size-7 fill-current" />
          ) : (
            <Play aria-hidden="true" className="ml-1 size-7 fill-current" />
          )}
        </button>
        <button
          type="button"
          aria-label="Avancer de 5 secondes"
          disabled={!ready}
          onClick={() => controller?.seekBy(SEEK_STEP_MS)}
          className="size-13 rounded-full bg-surface-2 text-xs font-bold disabled:opacity-40"
        >
          +5 s
        </button>
      </div>

      {/* Its track lies on the top edge of the keyboard (the slider is 24 px high, the track centred). */}
      <div
        className={cx("absolute inset-x-3 md:inset-x-6", ROW)}
        style={{ bottom: `calc(${KEYBOARD_TOP} - 12px)` }}
      >
        <ProgressBar store={store} controller={ready ? controller : null} />
      </div>
    </div>
  );
}
