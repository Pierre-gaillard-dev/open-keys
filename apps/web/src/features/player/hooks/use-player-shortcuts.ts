import { useEffect } from "react";
import { type PlayerController, TEMPO_STEP_PCT } from "../controller/player-controller";

export const SEEK_STEP_MS = 5000;

export interface ShortcutHandlers {
  readonly onExit: () => void;
  readonly onFullscreen: () => void;
  readonly onActivity: () => void;
}

/** Keyboard shortcuts of the PC player (UC-08). Ignored while typing in a field. */
export function usePlayerShortcuts(controller: PlayerController | null, handlers: ShortcutHandlers) {
  useEffect(() => {
    if (!controller) {
      return;
    }
    const actions = new Map<string, () => void>([
      [" ", () => void controller.toggle()],
      ["ArrowLeft", () => controller.seekBy(-SEEK_STEP_MS)],
      ["ArrowRight", () => controller.seekBy(SEEK_STEP_MS)],
      ["ArrowUp", () => controller.changeTempo(TEMPO_STEP_PCT)],
      ["ArrowDown", () => controller.changeTempo(-TEMPO_STEP_PCT)],
      ["a", () => controller.markLoopStart()],
      ["b", () => controller.markLoopEnd()],
      ["l", () => controller.toggleLoop()],
      ["1", () => controller.toggleHand("left", "audible")],
      ["2", () => controller.toggleHand("right", "audible")],
      ["z", () => controller.toggleZoom()],
      ["f", handlers.onFullscreen],
      ["Escape", handlers.onExit],
    ]);
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        event.metaKey ||
        event.ctrlKey
      ) {
        return;
      }
      const action = actions.get(event.key.length === 1 ? event.key.toLowerCase() : event.key);
      if (action) {
        event.preventDefault();
        action();
        handlers.onActivity();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [controller, handlers]);
}
