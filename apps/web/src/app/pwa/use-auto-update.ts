import { useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useStore } from "zustand";
import { pwaStore } from "./pwa.store";

/** A version found this soon after the page loaded is applied at once: the user has just opened the app. */
export const STARTUP_WINDOW_MS = 15_000;

/**
 * Applies a new version of the app without asking, when it interrupts nothing (D22): right after the
 * start, or at the next page change (never in the middle of a form being filled). Used by the app shell
 * only, so never in the player: a version found while practising waits until the player is left.
 */
export function useAutoUpdate(): void {
  const update = useStore(pwaStore, (state) => state.update);
  const href = useRouterState({ select: (state) => state.location.href });
  const applying = useRef(false);

  useEffect(() => {
    // Right after the start, or once the page where the version was found has been left.
    if (update && !applying.current && (href !== update.href || performance.now() < STARTUP_WINDOW_MS)) {
      applying.current = true;
      void update.apply();
    }
  }, [update, href]);
}
