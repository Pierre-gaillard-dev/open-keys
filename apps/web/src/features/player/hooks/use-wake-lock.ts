import { useEffect } from "react";

/** Keeps the screen on while playing (phone on a tripod). Silently ignored where unsupported. */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!(active && "wakeLock" in navigator)) {
      return;
    }
    let sentinel: WakeLockSentinel | undefined;
    let released = false;
    navigator.wakeLock
      .request("screen")
      .then((lock) => {
        if (released) {
          void lock.release();
        } else {
          sentinel = lock;
        }
      })
      .catch(() => undefined);
    return () => {
      released = true;
      void sentinel?.release();
    };
  }, [active]);
}
