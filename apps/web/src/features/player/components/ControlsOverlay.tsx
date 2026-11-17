import type { Loop } from "@open-keys/contracts";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ListMusic, Maximize, Minimize, Minus, Pause, Play, Plus, ScanSearch } from "lucide-react";
import { useState } from "react";
import { useStore } from "zustand";
import { cx } from "../../../shared/lib/cx";
import { IconButton } from "../../../shared/ui";
import { type PlayerController, TEMPO_STEP_PCT } from "../controller/player-controller";
import { SEEK_STEP_MS } from "../hooks/use-player-shortcuts";
import type { PlayerStore } from "../stores/player.store";
import { HandControl } from "./HandControl";
import { LoopPanel } from "./LoopPanel";
import { ProgressBar } from "./ProgressBar";

export interface ControlsOverlayProps {
  readonly songId: string;
  readonly title: string;
  readonly composer: string | null;
  readonly store: PlayerStore;
  readonly controller: PlayerController | null;
  readonly savedLoops: readonly Loop[];
  readonly visible: boolean;
  readonly isFullscreen: boolean;
  readonly onToggleFullscreen: () => void;
}

const PILL = "m-0 flex h-12 items-center rounded-xl border-0 bg-surface-2 px-1";
const PILL_BUTTON =
  "flex h-10 items-center justify-center rounded-lg px-3 text-sm font-semibold disabled:opacity-40";

/** Rows spanning the screen: only their children catch taps, the gaps let them through to the background. */
const ROW = "pointer-events-none *:pointer-events-auto";

/**
 * Controls drawn over the falling notes (mockups: mobile landscape and PC). The bottom part sits just
 * above the keyboard, whose height follows the renderer's rule (20 % of the screen, 56–170 px).
 */
export function ControlsOverlay(props: ControlsOverlayProps) {
  const {
    songId,
    title,
    composer,
    store,
    controller,
    savedLoops,
    visible,
    isFullscreen,
    onToggleFullscreen,
  } = props;
  const status = useStore(store, (state) => state.status);
  const tempoPct = useStore(store, (state) => state.tempoPct);
  const loop = useStore(store, (state) => state.loop);
  const loopEnabled = useStore(store, (state) => state.loopEnabled);
  const pendingStart = useStore(store, (state) => state.pendingLoopStartMs);
  const zoom = useStore(store, (state) => state.zoom);
  const [loopsOpen, setLoopsOpen] = useState(false);
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
        className="absolute inset-x-0 top-0 bg-bg/80"
        style={{ bottom: "clamp(56px, 20%, 170px)" }}
      />

      <header className={cx("absolute inset-x-3 top-3 flex items-center gap-3", ROW)}>
        <Link
          to="/songs/$songId"
          params={{ songId }}
          aria-label="Quitter le lecteur"
          className="flex size-11 items-center justify-center rounded-xl bg-surface-2"
        >
          <ArrowLeft aria-hidden="true" className="size-5" />
        </Link>
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="truncate font-display text-base font-bold md:text-lg">{title}</h1>
          {composer && <p className="truncate text-xs text-fg-muted md:text-sm">{composer}</p>}
        </div>
        <IconButton
          label={zoom ? "Afficher tout le clavier" : "Zoomer sur les notes du morceau"}
          aria-pressed={zoom}
          onClick={() => controller?.toggleZoom()}
          className="border-0 bg-surface-2"
        >
          <ScanSearch aria-hidden="true" className="size-5" />
        </IconButton>
        <IconButton
          label={isFullscreen ? "Quitter le plein écran" : "Plein écran"}
          onClick={onToggleFullscreen}
          className="border-0 bg-surface-2"
        >
          {isFullscreen ? (
            <Minimize aria-hidden="true" className="size-5" />
          ) : (
            <Maximize aria-hidden="true" className="size-5" />
          )}
        </IconButton>
        <div className="relative">
          <button
            type="button"
            aria-expanded={loopsOpen}
            onClick={() => setLoopsOpen((open) => !open)}
            className="flex h-11 items-center gap-2 rounded-xl bg-surface-2 px-3 text-sm font-semibold"
          >
            <ListMusic aria-hidden="true" className="size-4" />
            <span className="hidden sm:inline">Boucles ({savedLoops.length})</span>
          </button>
          {loopsOpen && (
            <div className="absolute top-13 right-0 z-10">
              <LoopPanel
                songId={songId}
                store={store}
                controller={controller}
                savedLoops={savedLoops}
                onClose={() => setLoopsOpen(false)}
              />
            </div>
          )}
        </div>
      </header>

      <div
        className={cx(
          "absolute inset-x-0 top-1/2 flex -translate-y-[60%] items-center justify-center gap-6",
          ROW,
        )}
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

      <div
        className={cx("absolute inset-x-3 flex flex-col gap-3 pb-3 md:inset-x-6", ROW)}
        style={{ bottom: "clamp(56px, 20%, 170px)" }}
      >
        <ProgressBar store={store} controller={ready ? controller : null} />
        <div className={cx("flex flex-wrap items-center gap-2", ROW)}>
          <fieldset className={PILL}>
            <legend className="sr-only">Vitesse</legend>
            <button
              type="button"
              aria-label="Ralentir"
              disabled={!ready}
              onClick={() => controller?.changeTempo(-TEMPO_STEP_PCT)}
              className={PILL_BUTTON}
            >
              <Minus aria-hidden="true" className="size-4" />
            </button>
            <output aria-live="polite" className="min-w-14 text-center font-bold">
              {tempoPct} %
            </output>
            <button
              type="button"
              aria-label="Accélérer"
              disabled={!ready}
              onClick={() => controller?.changeTempo(TEMPO_STEP_PCT)}
              className={PILL_BUTTON}
            >
              <Plus aria-hidden="true" className="size-4" />
            </button>
          </fieldset>
          <fieldset className={PILL}>
            <legend className="sr-only">Boucle A-B</legend>
            <button
              type="button"
              disabled={!ready}
              onClick={() => controller?.markLoopStart()}
              className={cx(PILL_BUTTON, pendingStart !== null && "text-hand-left")}
              aria-label="Début de boucle (A)"
            >
              A
            </button>
            <button
              type="button"
              disabled={!ready}
              onClick={() => controller?.markLoopEnd()}
              className={PILL_BUTTON}
              aria-label="Fin de boucle (B)"
            >
              B
            </button>
            <button
              type="button"
              aria-pressed={loopEnabled}
              disabled={!(ready && loop)}
              onClick={() => controller?.toggleLoop()}
              className={cx(PILL_BUTTON, loopEnabled && "bg-fg text-bg")}
            >
              Boucle
            </button>
          </fieldset>
          <div className="flex-1" />
          <HandControl hand="left" store={store} controller={ready ? controller : null} />
          <HandControl hand="right" store={store} controller={ready ? controller : null} />
        </div>
      </div>
    </div>
  );
}
