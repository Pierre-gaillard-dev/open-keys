import { firstNoteIndexAtOrAfter, type Hand, type Timeline } from "@open-keys/core";
import type { AudioClockSource, SongClock } from "./song-clock";

/** Anything that can play a note at an absolute audio time (PianoSampler, or a fake in tests). */
export interface NoteOutput {
  play(pitch: number, startTime: number, duration: number, velocity: number): void;
  stopAll(): void;
}

export interface LoopRange {
  /** Song seconds */
  readonly start: number;
  readonly end: number;
}

/** How far ahead (real seconds) notes are handed to the audio graph. */
export const LOOKAHEAD_S = 0.15;
export const TICK_MS = 25;
/** Notes that should have started more than this long ago are skipped, never played late. */
export const LATE_TOLERANCE_S = 0.02;
const MIN_NOTE_DURATION_S = 0.05;

/** Feeds the sampler slightly ahead of time, from the timeline and the clock. */
export class NoteScheduler {
  readonly #timeline: Timeline;
  readonly #clock: SongClock;
  readonly #output: NoteOutput;
  readonly #source: AudioClockSource;
  #nextIndex = 0;
  #timer: ReturnType<typeof setInterval> | undefined;

  loop: LoopRange | null = null;
  readonly audibleHands: Record<Hand, boolean> = { left: true, right: true };
  onLoop: (start: number) => void = () => undefined;
  onEnd: () => void = () => undefined;
  skippedLateNotes = 0;

  constructor(timeline: Timeline, clock: SongClock, output: NoteOutput, source: AudioClockSource) {
    this.#timeline = timeline;
    this.#clock = clock;
    this.#output = output;
    this.#source = source;
  }

  start(): void {
    if (this.#timer === undefined) {
      this.#timer = setInterval(() => this.tick(), TICK_MS);
      this.tick();
    }
  }

  stop(): void {
    if (this.#timer !== undefined) {
      clearInterval(this.#timer);
      this.#timer = undefined;
    }
    this.#output.stopAll();
  }

  /** After a seek or a rate change: cancel pending notes and reposition. */
  reset(songTime: number): void {
    this.#output.stopAll();
    this.#nextIndex = firstNoteIndexAtOrAfter(this.#timeline.notes, songTime);
  }

  tick(): void {
    if (!this.#clock.isPlaying) {
      return;
    }
    const now = this.#source.currentTime;
    const playing = this.#clock.songTimeAtAudioTime(now);
    if (this.loop && playing >= this.loop.end) {
      this.#clock.seek(this.loop.start);
      this.reset(this.loop.start);
      this.onLoop(this.loop.start);
      return;
    }
    if (playing > this.#timeline.durationS + 0.5) {
      this.onEnd();
      return;
    }
    const horizon = this.#clock.songTimeAtAudioTime(now + LOOKAHEAD_S);
    this.#scheduleUntil(this.loop ? Math.min(horizon, this.loop.end) : horizon, now);
  }

  #scheduleUntil(limit: number, now: number): void {
    const notes = this.#timeline.notes;
    const rate = this.#clock.rate;
    let note = notes[this.#nextIndex];
    while (note !== undefined && note.start < limit) {
      if (this.audibleHands[note.hand]) {
        const audioStart = this.#clock.audioTimeAtSongTime(note.start);
        if (audioStart < now - LATE_TOLERANCE_S) {
          this.skippedLateNotes++;
        } else {
          const end = this.loop ? Math.min(note.soundEnd, this.loop.end) : note.soundEnd;
          const duration = Math.max(MIN_NOTE_DURATION_S, (end - note.start) / rate);
          this.#output.play(note.pitch, Math.max(audioStart, now), duration, note.velocity);
        }
      }
      this.#nextIndex++;
      note = notes[this.#nextIndex];
    }
  }
}
