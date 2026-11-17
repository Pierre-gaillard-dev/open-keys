import { useCallback, useEffect, useRef, useState } from "react";

/** Controls shown again during playback (tap, pointer move, key) hide after this delay. */
export const AUTO_HIDE_DELAY_MS = 3000;

/**
 * Controls of the player: shown on pause, hidden as soon as playback starts (the fade lasts 200 ms),
 * shown again by `poke` for a few seconds during playback. `hide` dismisses them at any time.
 */
export function useAutoHide(playing: boolean, delayMs = AUTO_HIDE_DELAY_MS) {
  const [visible, setVisible] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const hide = useCallback(() => {
    clearTimeout(timer.current);
    setVisible(false);
  }, []);

  const poke = useCallback(() => {
    clearTimeout(timer.current);
    setVisible(true);
    if (playing) {
      timer.current = setTimeout(() => setVisible(false), delayMs);
    }
  }, [playing, delayMs]);

  useEffect(() => {
    clearTimeout(timer.current);
    setVisible(!playing);
    return () => clearTimeout(timer.current);
  }, [playing]);

  return { visible, poke, hide };
}
