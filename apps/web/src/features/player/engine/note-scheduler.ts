import {
  type CountIn,
  countInAt,
  firstBeatIndexAtOrAfter,
  firstNoteIndexAtOrAfter,
  type Hand,
  type PlayableNote,
  type Timeline,
} from "@open-keys/core";
import type { AudioClockSource, SongClock } from "./song-clock";

/** Anything that can play a note at an absolute audio time (PianoSampler, or a fake in tests). */
export interface NoteOutput {
  play(pitch: number, startTime: number, duration: number, velocity: number): void;
  stopAll(): void;
}

/** Metronome and count-in clicks at an absolute audio time (Metronome, or a fake in tests). */
export interface ClickOutput {
  click(time: number, accent: boolean): void;
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

/** Audio times of the clicks of a count-in starting at `firstClick`. */
export function countInClickTimes(firstClick: number, countIn: CountIn, rate: number): number[] {
  return Array.from({ length: countIn.beats }, (_, beat) => firstClick + (beat * countIn.beatS) / rate);
}

/** Real seconds of a count-in at `rate`. */
export function countInDuration(countIn: CountIn, rate: number): number {
  return (countIn.beats * countIn.beatS) / rate;
}

/** Feeds the sampler and the metronome slightly ahead of time, from the timeline and the clock. */
export class NoteScheduler {
  readonly #timeline: Timeline;
  readonly #clock: SongClock;
  readonly #output: NoteOutput;
  readonly #clicks: ClickOutput;
  readonly #source: AudioClockSource;
  #nextIndex = 0;
  #nextBeat = 0;
  #timer: ReturnType<typeof setInterval> | undefined;

  loop: LoopRange | null = null;
  /** Clicks on every beat (UC-24). */
  metronome = false;
  /** One bar of clicks before going back to the start of the loop (UC-22). */
  loopCountIn = false;
  readonly audibleHands: Record<Hand, boolean> = { left: true, right: true };
  /** 0–1, applied to the velocity of the notes of each hand (UC-25). */
  readonly handVolumes: Record<Hand, number> = { left: 1, right: 1 };
  /** Back to the start of the loop; with a count-in, the audio times of its clicks. */
  onLoop: (start: number, countInClicks: readonly number[]) => void = () => undefined;
  onEnd: () => void = () => undefined;
  skippedLateNotes = 0;

  constructor(
    timeline: Timeline,
    clock: SongClock,
    output: NoteOutput,
    clicks: ClickOutput,
    source: AudioClockSource,
  ) {
    this.#timeline = timeline;
    this.#clock = clock;
    this.#output = output;
    this.#clicks = clicks;
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
    this.#clicks.stopAll();
  }

  /** After a seek or a rate change: cancel pending notes and clicks, and reposition. */
  reset(songTime: number): void {
    this.#output.stopAll();
    this.#clicks.stopAll();
    this.#nextIndex = firstNoteIndexAtOrAfter(this.#timeline.notes, songTime);
    this.#nextBeat = firstBeatIndexAtOrAfter(this.#timeline.beats, songTime);
  }

  /** Plays the clicks of a count-in from `firstClick` (audio time): returns their audio times. */
  playCountIn(firstClick: number, countIn: CountIn): number[] {
    const times = countInClickTimes(firstClick, countIn, this.#clock.rate);
    for (const [beat, time] of times.entries()) {
      this.#clicks.click(time, beat === 0);
    }
    return times;
  }

  tick(): void {
    if (!this.#clock.isPlaying) {
      return;
    }
    const now = this.#source.currentTime;
    const playing = this.#clock.songTimeAtAudioTime(now);
    if (this.loop && playing >= this.loop.end) {
      this.#restartLoop(this.loop);
      return;
    }
    if (playing > this.#timeline.durationS + 0.5) {
      this.onEnd();
      return;
    }
    const horizon = this.#clock.songTimeAtAudioTime(now + LOOKAHEAD_S);
    const limit = this.loop ? Math.min(horizon, this.loop.end) : horizon;
    this.#scheduleUntil(limit, now);
    if (this.metronome) {
      this.#clickUntil(limit, now);
    } else {
      this.#nextBeat = firstBeatIndexAtOrAfter(this.#timeline.beats, limit);
    }
  }

  #restartLoop(loop: LoopRange): void {
    if (!this.loopCountIn) {
      this.#clock.seek(loop.start);
      this.reset(loop.start);
      this.onLoop(loop.start, []);
      return;
    }
    const countIn = countInAt(this.#timeline.beats, loop.start);
    const musicStart = this.#clock.seek(loop.start, countInDuration(countIn, this.#clock.rate));
    this.reset(loop.start);
    const firstClick = musicStart - countInDuration(countIn, this.#clock.rate);
    this.onLoop(loop.start, this.playCountIn(firstClick, countIn));
  }

  #clickUntil(limit: number, now: number): void {
    const beats = this.#timeline.beats;
    let beat = beats[this.#nextBeat];
    while (beat !== undefined && beat.time < limit) {
      const audioTime = this.#clock.audioTimeAtSongTime(beat.time);
      if (audioTime >= now - LATE_TOLERANCE_S) {
        this.#clicks.click(Math.max(audioTime, now), beat.downbeat);
      }
      this.#nextBeat++;
      beat = beats[this.#nextBeat];
    }
  }

  #scheduleUntil(limit: number, now: number): void {
    const notes = this.#timeline.notes;
    let note = notes[this.#nextIndex];
    while (note !== undefined && note.start < limit) {
      if (this.audibleHands[note.hand]) {
        this.#playNote(note, now);
      }
      this.#nextIndex++;
      note = notes[this.#nextIndex];
    }
  }

  #playNote(note: PlayableNote, now: number): void {
    const audioStart = this.#clock.audioTimeAtSongTime(note.start);
    if (audioStart < now - LATE_TOLERANCE_S) {
      this.skippedLateNotes++;
      return;
    }
    const velocity = note.velocity * this.handVolumes[note.hand];
    if (velocity <= 0) {
      return;
    }
    const end = this.loop ? Math.min(note.soundEnd, this.loop.end) : note.soundEnd;
    const duration = Math.max(MIN_NOTE_DURATION_S, (end - note.start) / this.#clock.rate);
    this.#output.play(note.pitch, Math.max(audioStart, now), duration, velocity);
  }
}
