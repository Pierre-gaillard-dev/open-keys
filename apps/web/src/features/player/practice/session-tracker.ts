/** UC-08: a session is only recorded after 10 s of actual playback. */
export const MIN_SESSION_ACTIVE_MS = 10_000;

export interface SessionSnapshot {
  readonly startedAt: number;
  readonly endedAt: number;
  readonly activeMs: number;
  readonly minTempoPct: number;
  readonly maxTempoPct: number;
}

/** Measures actual playback time (pauses excluded) and the range of speeds used during a visit. */
export class SessionTracker {
  readonly #now: () => number;
  #startedAt: number | null = null;
  #playingSince: number | null = null;
  #activeMs = 0;
  #minTempo = Number.POSITIVE_INFINITY;
  #maxTempo = 0;

  constructor(now: () => number = Date.now) {
    this.#now = now;
  }

  get activeMs(): number {
    const running = this.#playingSince === null ? 0 : this.#now() - this.#playingSince;
    return this.#activeMs + running;
  }

  playing(tempoPct: number): void {
    const now = this.#now();
    this.#startedAt ??= now;
    this.#playingSince ??= now;
    this.tempo(tempoPct);
  }

  paused(): void {
    if (this.#playingSince !== null) {
      this.#activeMs += this.#now() - this.#playingSince;
      this.#playingSince = null;
    }
  }

  tempo(tempoPct: number): void {
    this.#minTempo = Math.min(this.#minTempo, tempoPct);
    this.#maxTempo = Math.max(this.#maxTempo, tempoPct);
  }

  /**
   * A new session starts now (another way of practising): the time and speeds so far are dropped,
   * playback keeps running if it was.
   */
  restart(tempoPct: number): void {
    const playing = this.#playingSince !== null;
    const now = this.#now();
    this.#startedAt = playing ? now : null;
    this.#playingSince = playing ? now : null;
    this.#activeMs = 0;
    this.#minTempo = playing ? tempoPct : Number.POSITIVE_INFINITY;
    this.#maxTempo = playing ? tempoPct : 0;
  }

  /** The session so far, or null when it is too short to be recorded. */
  snapshot(): SessionSnapshot | null {
    const activeMs = Math.round(this.activeMs);
    if (this.#startedAt === null || activeMs < MIN_SESSION_ACTIVE_MS) {
      return null;
    }
    return {
      startedAt: this.#startedAt,
      endedAt: this.#now(),
      activeMs,
      minTempoPct: this.#minTempo,
      maxTempoPct: this.#maxTempo,
    };
  }
}
