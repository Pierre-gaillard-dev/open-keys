import { useCallback, useEffect, useRef, useState } from "react";

export const AUTO_HIDE_DELAY_MS = 3000;

/**
 * Controls visible while paused; while playing they hide after 3 s without interaction.
 * `poke` shows them again (pointer move, tap, key).
 */
export function useAutoHide(active: boolean, delayMs = AUTO_HIDE_DELAY_MS) {
  const [visible, setVisible] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const poke = useCallback(() => {
    setVisible(true);
    clearTimeout(timer.current);
    if (active) {
      timer.current = setTimeout(() => setVisible(false), delayMs);
    }
  }, [active, delayMs]);

  useEffect(() => {
    poke();
    return () => clearTimeout(timer.current);
  }, [poke]);

  return { visible, poke, hide: useCallback(() => active && setVisible(false), [active]) };
}
