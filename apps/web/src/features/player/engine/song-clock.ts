/** What the clock needs from an AudioContext (kept minimal so it can be faked in tests). */
export interface AudioClockSource {
  readonly currentTime: number;
  readonly baseLatency: number;
  /** Not implemented everywhere: may be undefined at runtime. */
  readonly outputLatency: number;
}

/** Small delay so the first notes are never scheduled in the past. */
export const START_DELAY_S = 0.1;

/**
 * Single source of truth for time: the audio clock (D17).
 * Song time = position in the score in seconds at 100 % speed. The anchor (audio time, song time, rate)
 * is the only state: play, pause, seek and rate changes just move it.
 */
export class SongClock {
  readonly #source: AudioClockSource;
  #playing = false;
  #rate = 1;
  #anchorAudioTime = 0;
  #anchorSongTime = 0;
  /** Manual visual offset in real milliseconds, for hardware that misreports its latency. */
  offsetMs = 0;

  constructor(source: AudioClockSource) {
    this.#source = source;
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

  /** What is being sent to the audio graph now: used by the scheduler. */
  scheduledSongTime(): number {
    return this.songTimeAtAudioTime(this.#source.currentTime);
  }

  /**
   * What is coming out of the speakers now: used by the renderer.
   * currentTime − outputLatency − baseLatency is the only formula consistent on Chrome and Firefox
   * (Firefox's getOutputTimestamp ignores the output latency, see docs/03-architecture/04-lecteur.md).
   */
  heardSongTime(): number {
    const source = this.#source;
    const latency = (Number(source.outputLatency) || 0) + (Number(source.baseLatency) || 0);
    return this.songTimeAtAudioTime(source.currentTime - latency) - (this.offsetMs / 1000) * this.#rate;
  }

  play(): void {
    if (!this.#playing) {
      this.#anchorAudioTime = this.#source.currentTime + START_DELAY_S;
      this.#playing = true;
    }
  }

  pause(): void {
    if (this.#playing) {
      this.#anchorSongTime = this.scheduledSongTime();
      this.#playing = false;
    }
  }

  seek(songTime: number): void {
    this.#anchorSongTime = Math.max(0, songTime);
    if (this.#playing) {
      this.#anchorAudioTime = this.#source.currentTime + START_DELAY_S;
    }
  }

  setRate(rate: number): void {
    const now = this.#source.currentTime;
    this.#anchorSongTime = this.songTimeAtAudioTime(now);
    this.#anchorAudioTime = now;
    this.#rate = rate;
  }
}
