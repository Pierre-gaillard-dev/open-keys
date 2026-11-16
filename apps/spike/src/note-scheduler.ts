import { Frequency, type Sampler } from "tone";
import { firstNoteAtOrAfter, type Song } from "./song";
import type { SongClock } from "./song-clock";

/** How far ahead (in real seconds) notes are handed to the audio graph. */
const LOOKAHEAD_S = 0.15;
const TICK_MS = 25;
/** Notes that should have started more than this long ago are skipped, not played late. */
const LATE_TOLERANCE_S = 0.02;

export interface LoopRange {
  readonly start: number;
  readonly end: number;
}

export interface SchedulerStats {
  scheduledNotes: number;
  skippedLateNotes: number;
  loopCount: number;
}

export class NoteScheduler {
  readonly #clock: SongClock;
  readonly #sampler: Sampler;
  readonly #context: AudioContext;
  #song: Song | undefined;
  #nextIndex = 0;
  #timer: ReturnType<typeof setInterval> | undefined;

  loop: LoopRange | undefined;
  onEnd: () => void = () => undefined;
  readonly stats: SchedulerStats = { scheduledNotes: 0, skippedLateNotes: 0, loopCount: 0 };

  constructor(clock: SongClock, sampler: Sampler, context: AudioContext) {
    this.#clock = clock;
    this.#sampler = sampler;
    this.#context = context;
  }

  setSong(song: Song): void {
    this.#song = song;
    this.reset(0);
  }

  start(): void {
    if (this.#timer === undefined) {
      this.#timer = setInterval(() => this.#tick(), TICK_MS);
      this.#tick();
    }
  }

  stop(): void {
    if (this.#timer !== undefined) {
      clearInterval(this.#timer);
      this.#timer = undefined;
    }
    this.#sampler.releaseAll();
  }

  /** Call after any seek or rate change: cancels pending notes and repositions. */
  reset(songTime: number): void {
    this.#sampler.releaseAll();
    this.#nextIndex = this.#song ? firstNoteAtOrAfter(this.#song.notes, songTime) : 0;
  }

  #tick(): void {
    const song = this.#song;
    if (!(song && this.#clock.isPlaying)) {
      return;
    }
    const now = this.#context.currentTime;
    const playingSongTime = this.#clock.songTimeAtAudioTime(now);

    if (this.loop && playingSongTime >= this.loop.end) {
      this.stats.loopCount++;
      this.#clock.seek(this.loop.start);
      this.reset(this.loop.start);
      return;
    }
    if (playingSongTime > song.duration + 0.5) {
      this.onEnd();
      return;
    }

    const horizon = this.#clock.songTimeAtAudioTime(now + LOOKAHEAD_S);
    const limit = this.loop ? Math.min(horizon, this.loop.end) : horizon;
    this.#scheduleUntil(song, limit, now);
  }

  #scheduleUntil(song: Song, limit: number, now: number): void {
    const rate = this.#clock.rate;
    let note = song.notes[this.#nextIndex];
    while (note !== undefined && note.start < limit) {
      const audioStart = this.#clock.audioTimeAtSongTime(note.start);
      if (audioStart < now - LATE_TOLERANCE_S) {
        this.stats.skippedLateNotes++;
      } else {
        const end = this.loop ? Math.min(note.soundEnd, this.loop.end) : note.soundEnd;
        const duration = Math.max(0.05, (end - note.start) / rate);
        const name = Frequency(note.pitch, "midi").toNote();
        this.#sampler.triggerAttackRelease(name, duration, Math.max(audioStart, now), note.velocity);
        this.stats.scheduledNotes++;
      }
      this.#nextIndex++;
      note = song.notes[this.#nextIndex];
    }
  }
}
