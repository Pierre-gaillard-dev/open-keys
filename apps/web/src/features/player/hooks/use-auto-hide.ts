import { useCallback, useEffect, useRef, useState } from "react";

/** Controls shown again during playback (tap, pointer move, key) hide after this delay. */
export const AUTO_HIDE_DELAY_MS = 3000;
/** After a tap that dismissed the controls, the mouse moving along does not bring them back. */
const HIDE_GRACE_MS = 600;

/**
 * Controls of the player: shown on pause, hidden as soon as playback starts (the fade lasts 200 ms),
 * shown again by `poke` for a few seconds during playback. `hide` dismisses them at any time.
 * While `hold` is true (a panel is open), they stay shown.
 */
export function useAutoHide(playing: boolean, hold = false, delayMs = AUTO_HIDE_DELAY_MS) {
  const [visible, setVisible] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hiddenAt = useRef(Number.NEGATIVE_INFINITY);

  const hide = useCallback(() => {
    clearTimeout(timer.current);
    hiddenAt.current = performance.now();
    setVisible(false);
  }, []);

  const poke = useCallback(() => {
    clearTimeout(timer.current);
    setVisible(true);
    if (playing && !hold) {
      timer.current = setTimeout(() => setVisible(false), delayMs);
    }
  }, [playing, hold, delayMs]);

  /** A mouse moving shows the controls, not a finger (it moves a little during every tap). */
  const pointerMoved = useCallback(
    (pointerType: string) => {
      if (pointerType === "mouse" && performance.now() - hiddenAt.current > HIDE_GRACE_MS) {
        poke();
      }
    },
    [poke],
  );

  useEffect(() => {
    clearTimeout(timer.current);
    setVisible(!playing);
    return () => clearTimeout(timer.current);
  }, [playing]);

  // A panel closed during playback: the controls go away after the usual delay.
  useEffect(() => {
    clearTimeout(timer.current);
    if (hold) {
      setVisible(true);
    } else if (playing) {
      timer.current = setTimeout(() => setVisible(false), delayMs);
    }
    return () => clearTimeout(timer.current);
  }, [hold, playing, delayMs]);

  return { visible, poke, hide, pointerMoved };
}
