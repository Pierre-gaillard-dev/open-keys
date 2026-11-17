import { countInAt, type Hand, type Timeline } from "@open-keys/core";
import {
  type ClickOutput,
  countInDuration,
  type LoopRange,
  type NoteOutput,
  NoteScheduler,
} from "./note-scheduler";
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
  /** One bar of clicks before playing (UC-22). */
  countIn = false;
  onEnd: () => void = () => undefined;
  /** A count-in started (play or back to the start of the loop): audio times of its clicks. */
  onCountIn: (clicks: readonly number[]) => void = () => undefined;
  /** The loop was played to its end and starts again (UC-26). */
  onLoopRestart: () => void = () => undefined;

  constructor(timeline: Timeline, audio: PlayerAudio, output: NoteOutput, clicks: ClickOutput) {
    this.timeline = timeline;
    this.#audio = audio;
    this.clock = new SongClock(audio);
    this.#scheduler = new NoteScheduler(timeline, this.clock, output, clicks, audio);
    this.#scheduler.onEnd = () => {
      this.pause();
      this.seek(0);
      this.onEnd();
    };
    this.#scheduler.onLoop = (_start, countInClicks) => {
      this.onLoopRestart();
      if (countInClicks.length > 0) {
        this.onCountIn(countInClicks);
      }
    };
  }

  get isPlaying(): boolean {
    return this.clock.isPlaying;
  }

  /** Current position (song seconds), clamped to the piece. */
  get position(): number {
    return Math.min(this.timeline.durationS, Math.max(0, this.clock.scheduledSongTime()));
  }

  /** Now on the audio clock (for UI timers that follow the clicks). */
  get audioTime(): number {
    return this.#audio.currentTime;
  }

  async play(): Promise<void> {
    await this.#audio.resume();
    if (this.position >= this.timeline.durationS) {
      this.clock.seek(this.#scheduler.loop?.start ?? 0);
    }
    const from = this.clock.scheduledSongTime();
    this.#scheduler.reset(from);
    if (!this.countIn) {
      this.clock.play();
      this.#scheduler.start();
      return;
    }
    const countIn = countInAt(this.timeline.beats, from);
    const duration = countInDuration(countIn, this.clock.rate);
    const musicStart = this.clock.play(duration);
    this.#scheduler.start();
    this.onCountIn(this.#scheduler.playCountIn(musicStart - duration, countIn));
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

  setHandVolume(hand: Hand, volume: number): void {
    this.#scheduler.handVolumes[hand] = Math.min(1, Math.max(0, volume));
  }

  setMetronome(on: boolean): void {
    this.#scheduler.metronome = on;
  }

  /** Count-in before playing and before each return to the start of the loop. */
  setCountIn(on: boolean): void {
    this.countIn = on;
    this.#scheduler.loopCountIn = on;
  }

  dispose(): void {
    this.pause();
  }
}
