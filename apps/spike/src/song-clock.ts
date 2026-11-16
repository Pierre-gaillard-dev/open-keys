/**
 * Single source of truth for time: the audio clock.
 * Song time = position in the score in seconds at 100 % speed.
 */
export type SyncMode = "output-timestamp" | "current-time" | "raw";

/** Small delay so the first notes are never scheduled in the past. */
const START_DELAY_S = 0.1;

export class SongClock {
  readonly #context: AudioContext;
  #playing = false;
  #rate = 1;
  #anchorAudioTime = 0;
  #anchorSongTime = 0;

  /**
   * Default: currentTime − outputLatency − baseLatency, consistent on Chrome and Firefox.
   * Firefox's getOutputTimestamp() does not include the output latency (measured: 0 ms vs 42 ms reported).
   */
  syncMode: SyncMode = "current-time";
  /** Manual visual offset in real milliseconds (positive = visuals later). */
  offsetMs = 0;

  constructor(context: AudioContext) {
    this.#context = context;
  }

  get isPlaying(): boolean {
    return this.#playing;
  }

  get rate(): number {
    return this.#rate;
  }

  songTimeAtAudioTime(audioTime: number): number {
    if (!this.#playing) {
      return this.#anchorSongTime;
    }
    return this.#anchorSongTime + (audioTime - this.#anchorAudioTime) * this.#rate;
  }

  audioTimeAtSongTime(songTime: number): number {
    return this.#anchorAudioTime + (songTime - this.#anchorSongTime) / this.#rate;
  }

  /** Song time the scheduler works with (what is being sent to the audio graph now). */
  scheduledSongTime(): number {
    return this.songTimeAtAudioTime(this.#context.currentTime);
  }

  /** Song time currently coming out of the speakers: what the renderer must show. */
  heardSongTime(): number {
    const offsetSongSeconds = (this.offsetMs / 1000) * this.#rate;
    return this.songTimeAtAudioTime(this.heardAudioTime()) - offsetSongSeconds;
  }

  heardAudioTime(): number {
    const context = this.#context;
    if (this.syncMode === "output-timestamp") {
      const stamp = context.getOutputTimestamp();
      if (
        stamp.contextTime !== undefined &&
        stamp.performanceTime !== undefined &&
        stamp.performanceTime > 0
      ) {
        return stamp.contextTime + (performance.now() - stamp.performanceTime) / 1000;
      }
    }
    if (this.syncMode === "raw") {
      return context.currentTime;
    }
    return context.currentTime - (context.outputLatency || 0) - context.baseLatency;
  }

  play(): void {
    if (this.#playing) {
      return;
    }
    this.#anchorAudioTime = this.#context.currentTime + START_DELAY_S;
    this.#playing = true;
  }

  pause(): void {
    if (!this.#playing) {
      return;
    }
    this.#anchorSongTime = this.scheduledSongTime();
    this.#playing = false;
  }

  seek(songTime: number): void {
    this.#anchorSongTime = Math.max(0, songTime);
    if (this.#playing) {
      this.#anchorAudioTime = this.#context.currentTime + START_DELAY_S;
    }
  }

  setRate(rate: number): void {
    const now = this.#context.currentTime;
    this.#anchorSongTime = this.songTimeAtAudioTime(now);
    this.#anchorAudioTime = now;
    this.#rate = rate;
  }
}
