import type { Hand, Timeline } from "@open-keys/core";
import { type LoopRange, type NoteOutput, NoteScheduler } from "./note-scheduler";
import { type AudioClockSource, SongClock } from "./song-clock";

export interface PlayerAudio extends AudioClockSource {
  /** Browsers start audio contexts suspended until a user gesture. */
  resume(): Promise<void>;
}

/** Façade of the engine: everything the UI controller needs, nothing about rendering. */
export class PlayerEngine {
  readonly timeline: Timeline;
  readonly clock: SongClock;
  readonly #scheduler: NoteScheduler;
  readonly #audio: PlayerAudio;
  onEnd: () => void = () => undefined;

  constructor(timeline: Timeline, audio: PlayerAudio, output: NoteOutput) {
    this.timeline = timeline;
    this.#audio = audio;
    this.clock = new SongClock(audio);
    this.#scheduler = new NoteScheduler(timeline, this.clock, output, audio);
    this.#scheduler.onEnd = () => {
      this.pause();
      this.seek(0);
      this.onEnd();
    };
  }

  get isPlaying(): boolean {
    return this.clock.isPlaying;
  }

  /** Current position (song seconds), clamped to the piece. */
  get position(): number {
    return Math.min(this.timeline.durationS, Math.max(0, this.clock.scheduledSongTime()));
  }

  async play(): Promise<void> {
    await this.#audio.resume();
    if (this.position >= this.timeline.durationS) {
      this.clock.seek(this.#scheduler.loop?.start ?? 0);
    }
    this.#scheduler.reset(this.clock.scheduledSongTime());
    this.clock.play();
    this.#scheduler.start();
  }

  pause(): void {
    this.clock.pause();
    this.#scheduler.stop();
  }

  seek(songTime: number): void {
    const target = Math.min(this.timeline.durationS, Math.max(0, songTime));
    this.clock.seek(target);
    this.#scheduler.reset(target);
  }

  /** Speed factor (0.25–1): the pitch is unchanged, notes are simply scheduled later. */
  setRate(rate: number): void {
    this.clock.setRate(rate);
    this.#scheduler.reset(this.clock.scheduledSongTime());
  }

  /** Loop between two song times; playback jumps into it if outside. */
  setLoop(loop: LoopRange | null): void {
    this.#scheduler.loop = loop;
    if (loop && (this.position < loop.start || this.position >= loop.end)) {
      this.seek(loop.start);
    }
  }

  setHandAudible(hand: Hand, audible: boolean): void {
    this.#scheduler.audibleHands[hand] = audible;
  }

  dispose(): void {
    this.pause();
  }
}
