import type { SongClock } from "../engine/song-clock";

/** What the sync needs from an <audio> element (kept minimal so it can be faked in tests). */
export interface RecordingElement {
  currentTime: number;
  playbackRate: number;
  preservesPitch: boolean;
  readonly paused: boolean;
  play(): Promise<void>;
  pause(): void;
}

/** How often the recording is aligned on the clock (no React state involved). */
export const SYNC_INTERVAL_MS = 100;
/** Further than this from the clock, the recording jumps to the right place (seek, loop, start). */
export const JUMP_THRESHOLD_S = 0.15;
/** Closer, it catches up by playing slightly faster or slower: at most this share. */
const MAX_NUDGE = 0.03;
/** Seconds of drift corrected per second by the nudge. */
const NUDGE_GAIN = 0.5;

/**
 * Plays the original recording of a song along with the player (D35). The audio clock stays the only
 * clock (D17): the recording follows it, never the reverse. Both go through the same output, so the
 * recording is aligned on what is being scheduled (not on what is heard, which the latency delays
 * for both alike). Slower speeds keep the pitch (preservesPitch).
 */
export function createRecordingSync(clock: SongClock, element: RecordingElement) {
  let enabled = false;
  let timer: ReturnType<typeof setInterval> | undefined;

  const stop = () => {
    if (!element.paused) {
      element.pause();
    }
  };

  const sync = () => {
    const target = clock.scheduledSongTime();
    if (!(enabled && clock.isPlaying) || target < 0) {
      // Paused, waiting (wait mode) or counting in: silent, ready at the right place.
      stop();
      if (enabled && Math.abs(element.currentTime - Math.max(0, target)) > JUMP_THRESHOLD_S) {
        element.currentTime = Math.max(0, target);
      }
      return;
    }
    element.preservesPitch = true;
    const drift = element.currentTime - target;
    if (element.paused || Math.abs(drift) > JUMP_THRESHOLD_S) {
      element.currentTime = target;
      element.playbackRate = clock.rate;
      if (element.paused) {
        void element.play().catch(() => undefined);
      }
      return;
    }
    // Ahead (drift > 0): a little slower; behind: a little faster.
    const nudge = Math.min(MAX_NUDGE, Math.max(-MAX_NUDGE, -drift * NUDGE_GAIN));
    element.playbackRate = clock.rate * (1 + nudge);
  };

  return {
    /** Whether the recording is heard (else the player's piano is). */
    setEnabled(on: boolean) {
      enabled = on;
      if (on && timer === undefined) {
        timer = setInterval(sync, SYNC_INTERVAL_MS);
      }
      if (!on) {
        clearInterval(timer);
        timer = undefined;
        stop();
      }
      sync();
    },
    sync,
    dispose() {
      clearInterval(timer);
      timer = undefined;
      stop();
    },
  };
}
