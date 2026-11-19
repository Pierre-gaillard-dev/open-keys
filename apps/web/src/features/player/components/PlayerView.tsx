import type { LibraryEntry, Loop, SongDetail } from "@open-keys/contracts";
import type { Timeline } from "@open-keys/core";
import { useNavigate } from "@tanstack/react-router";
import { type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
import { ErrorBanner } from "../../../shared/ui";
import { useAutoHide } from "../hooks/use-auto-hide";
import { useFullscreen } from "../hooks/use-fullscreen";
import { useLoopProgress } from "../hooks/use-loop-progress";
import type { SamplesStatus } from "../hooks/use-player-runtime";
import { usePlayerSession } from "../hooks/use-player-session";
import { usePlayerShortcuts } from "../hooks/use-player-shortcuts";
import { usePracticePersistence } from "../hooks/use-practice-persistence";
import { useSavePreferences } from "../hooks/use-save-preferences";
import { useWakeLock } from "../hooks/use-wake-lock";
import type { PlayerRuntime } from "../runtime/browser-runtime";
import { type InitialPlayerState, loopSelectionOf } from "../stores/player.store";
import { loadPlayerPreferences } from "../stores/player-preferences";
import { ControlsOverlay, type PlayerPanel } from "./ControlsOverlay";
import { CountInBadge } from "./CountInBadge";
import { SpeedUpOffer } from "./SpeedUpOffer";

/** Resuming within the last second would immediately end: start over instead. */
const RESUME_MARGIN_MS = 1000;
/** Smallest side of a phone, in any orientation (a phone in landscape is ~844 px wide). */
const PHONE_SHORT_SIDE_PX = 600;

export interface PlayerViewProps {
  readonly song: SongDetail;
  readonly timeline: Timeline;
  readonly libraryEntry: LibraryEntry | null;
  readonly savedLoops: readonly Loop[];
  readonly runtime: PlayerRuntime;
  readonly samples: SamplesStatus;
}

function initialState(timeline: Timeline, entry: LibraryEntry | null): InitialPlayerState {
  const durationMs = Math.round(timeline.durationS * 1000);
  const position = entry?.lastPositionMs ?? 0;
  return {
    durationMs,
    positionMs: position < durationMs - RESUME_MARGIN_MS ? position : 0,
    tempoPct: entry?.lastTempoPct ?? 100,
    ...(entry ? { hands: entry.handsSettings } : {}),
    // On a phone, 88 keys are tiny: frame the piece's range (docs: zoom auto, priority 1).
    zoom: Math.min(window.innerWidth, window.innerHeight) < PHONE_SHORT_SIDE_PX,
    preferences: loadPlayerPreferences(),
  };
}

/**
 * Elements that react to a tap: a tap inside them never dismisses the controls. A panel counts as a
 * whole: a finger set on its text or its gaps to scroll it is not a tap on an empty area.
 */
const INTERACTIVE = "a, button, input, label, fieldset, form, [role='region'], [data-player-panel]";

/** True when the nearest meaningful ancestor of the tapped element is a background, not a control. */
function isBackground(target: EventTarget): boolean {
  const nearest =
    target instanceof Element ? target.closest(`${INTERACTIVE}, [data-player-background]`) : null;
  return nearest?.hasAttribute("data-player-background") ?? false;
}

export function PlayerView({ song, timeline, libraryEntry, savedLoops, runtime, samples }: PlayerViewProps) {
  const host = useRef<HTMLDivElement>(null);
  // Read once: the store is created from it on mount (later library updates come from this player).
  const initial = useMemo(() => initialState(timeline, libraryEntry), [timeline, libraryEntry]);
  const { store, tracker, controller } = usePlayerSession(timeline, initial, host, runtime, samples);
  usePracticePersistence(song.id, store, tracker, libraryEntry);
  useSavePreferences(store);
  useLoopProgress(store, savedLoops);
  const status = useStore(store, (state) => state.status);
  const error = useStore(store, (state) => state.error);
  const playing = status === "playing";
  useWakeLock(playing);
  const [panel, setPanel] = useState<PlayerPanel | null>(null);
  // An open panel keeps the controls shown, even while playing (A and B are set during playback).
  const autoHide = useAutoHide(playing, panel !== null);
  const fullscreen = useFullscreen();
  const navigate = useNavigate();

  const shortcutHandlers = useMemo(
    () => ({
      onExit: () => void navigate({ to: "/songs/$songId", params: { songId: song.id } }),
      onFullscreen: () => void fullscreen.toggle(),
      onActivity: autoHide.poke,
    }),
    [navigate, song.id, fullscreen.toggle, autoHide.poke],
  );
  usePlayerShortcuts(controller, shortcutHandlers);

  // Resume with the loop that was active last time.
  const lastLoopId = libraryEntry?.lastLoopId;
  useEffect(() => {
    const saved = savedLoops.find((loop) => loop.id === lastLoopId);
    if (controller && saved && store.getState().loop === null) {
      controller.selectLoop(loopSelectionOf(saved));
    }
  }, [controller, savedLoops, lastLoopId, store]);

  // A tap on an empty area closes the open panel, else dismisses the controls (to watch the notes, even
  // on pause); a tap on hidden controls shows them.
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!(autoHide.visible && isBackground(event.target))) {
      autoHide.poke();
    } else if (panel === null) {
      autoHide.hide();
    } else {
      setPanel(null);
    }
  };

  return (
    <div
      className="fixed inset-0 overflow-hidden bg-bg"
      onPointerMove={(event) => autoHide.pointerMoved(event.pointerType)}
      onPointerDown={onPointerDown}
    >
      <div ref={host} data-player-background className="absolute inset-0" data-testid="player-canvas" />
      <ControlsOverlay
        songId={song.id}
        title={song.title}
        composer={song.composer}
        store={store}
        controller={controller}
        savedLoops={savedLoops}
        visible={autoHide.visible}
        panel={panel}
        onPanelChange={setPanel}
        isFullscreen={fullscreen.isFullscreen}
        onToggleFullscreen={() => void fullscreen.toggle()}
      />
      <CountInBadge store={store} />
      <SpeedUpOffer store={store} controller={controller} />
      {status === "loading" && (
        <p role="status" className="absolute inset-x-0 bottom-1/3 text-center text-sm text-fg-soft">
          Chargement du piano…
        </p>
      )}
      {error && (
        <div className="absolute inset-x-4 top-20 mx-auto max-w-md">
          <ErrorBanner error={null} title={error} />
        </div>
      )}
    </div>
  );
}
