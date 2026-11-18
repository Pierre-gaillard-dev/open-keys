import { useCallback, useEffect, useState } from "react";

/** `lock` is missing from some browsers (and from older DOM typings): call it only if present. */
interface OrientationLock {
  readonly lock?: (orientation: "landscape") => Promise<void>;
  readonly unlock?: () => void;
}

/**
 * Full screen + landscape lock on phones (the 88 keys are unusable in portrait). Leaving the player
 * leaves the full screen too: the other pages are made for a normal window.
 */
export function useFullscreen() {
  const [isFullscreen, setFullscreen] = useState(() => Boolean(document.fullscreenElement));

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      if (document.fullscreenElement) {
        void document.exitFullscreen().catch(() => undefined);
      }
      try {
        (screen.orientation as OrientationLock).unlock?.();
      } catch {
        // Nothing was locked.
      }
    };
  }, []);

  const toggle = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      await document.documentElement.requestFullscreen();
      const orientation: OrientationLock = screen.orientation;
      await orientation.lock?.("landscape");
    } catch {
      // Unsupported (desktop orientation lock, iOS…): full screen is a comfort, not a requirement.
    }
  }, []);

  return { isFullscreen, toggle };
}
