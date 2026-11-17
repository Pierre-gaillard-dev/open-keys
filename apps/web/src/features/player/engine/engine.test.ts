import { buildTimeline, type Timeline } from "@open-keys/core";
import { describe, expect, it } from "vitest";
import { LATE_TOLERANCE_S, LOOKAHEAD_S, type NoteOutput, NoteScheduler } from "./note-scheduler";
import { PlayerEngine } from "./player-engine";
import { SongClock, START_DELAY_S } from "./song-clock";

class FakeAudio {
  currentTime = 10;
  baseLatency = 0.01;
  outputLatency = 0.04;
  resumed = 0;
  resume() {
    this.resumed++;
    return Promise.resolve();
  }
  advance(seconds: number) {
    this.currentTime += seconds;
  }
}

class RecordingOutput implements NoteOutput {
  played: { pitch: number; time: number; duration: number }[] = [];
  stops = 0;
  play(pitch: number, time: number, duration: number) {
    this.played.push({ pitch, time, duration });
  }
  stopAll() {
    this.stops++;
  }
}

/** One note per second (pitch 60, 61, …), right hand, plus one left-hand note at 0.5 s. */
function timeline(count = 10): Timeline {
  const notes = [
    ...Array.from({ length: count }, (_, i) => ({
      trackIndex: 0,
      pitch: 60 + i,
      start: i,
      end: i + 0.5,
      soundEnd: i + 0.8,
      velocity: 0.8,
    })),
    { trackIndex: 1, pitch: 40, start: 0.5, end: 1, soundEnd: 1, velocity: 0.8 },
  ].sort((a, b) => a.start - b.start);
  return buildTimeline(
    { durationS: count, notes },
    {
      mode: "tracks",
      splitPitch: 60,
      tracks: [
        { trackIndex: 0, hand: "right" },
        { trackIndex: 1, hand: "left" },
      ],
    },
  );
}

describe("SongClock", () => {
  it("starts after a small delay and follows the audio clock at the chosen rate", () => {
    const audio = new FakeAudio();
    const clock = new SongClock(audio);

    clock.play();
    audio.advance(START_DELAY_S + 2);

    expect(clock.scheduledSongTime()).toBeCloseTo(2);
    clock.setRate(0.5);
    audio.advance(2);
    expect(clock.scheduledSongTime()).toBeCloseTo(3);
  });

  it("shows what is heard: output and base latency are compensated", () => {
    const audio = new FakeAudio();
    const clock = new SongClock(audio);
    clock.play();
    audio.advance(START_DELAY_S + 1);

    expect(clock.heardSongTime()).toBeCloseTo(1 - 0.05);
    clock.offsetMs = 20;
    expect(clock.heardSongTime()).toBeCloseTo(1 - 0.07);
  });

  it("freezes on pause and resumes from the same position", () => {
    const audio = new FakeAudio();
    const clock = new SongClock(audio);
    clock.play();
    audio.advance(START_DELAY_S + 3);
    clock.pause();
    audio.advance(100);

    expect(clock.scheduledSongTime()).toBeCloseTo(3);
  });
});

describe("NoteScheduler", () => {
  function setup() {
    const audio = new FakeAudio();
    const clock = new SongClock(audio);
    const output = new RecordingOutput();
    const scheduler = new NoteScheduler(timeline(), clock, output, audio);
    return { audio, clock, output, scheduler };
  }

  it("schedules notes within the lookahead at their exact audio time", () => {
    const { audio, clock, output, scheduler } = setup();
    clock.play();
    audio.advance(START_DELAY_S + 0.9);

    scheduler.reset(clock.scheduledSongTime());
    scheduler.tick();

    expect(output.played.map((note) => note.pitch)).toEqual([61]);
    expect(output.played[0]?.time).toBeCloseTo(audio.currentTime + 0.1);
    expect(output.played[0]?.duration).toBeCloseTo(0.8);
    expect(LOOKAHEAD_S).toBeGreaterThan(0.1);
  });

  it("stretches durations at a slower rate", () => {
    const { audio, clock, output, scheduler } = setup();
    clock.setRate(0.5);
    clock.play();
    audio.advance(START_DELAY_S);

    scheduler.tick();

    expect(output.played.find((note) => note.pitch === 60)?.duration).toBeCloseTo(1.6);
  });

  it("silences a muted hand", () => {
    const { audio, clock, output, scheduler } = setup();
    scheduler.audibleHands.left = false;
    clock.play();
    for (let i = 0; i < 20; i++) {
      audio.advance(0.05);
      scheduler.tick();
    }

    expect(output.played.map((note) => note.pitch)).not.toContain(40);
    expect(output.played.map((note) => note.pitch)).toContain(60);
  });

  it("skips notes that are already too late instead of playing them late", () => {
    const { audio, clock, output, scheduler } = setup();
    clock.play();
    audio.advance(START_DELAY_S + 0.5 + LATE_TOLERANCE_S * 3);

    scheduler.tick();

    expect(output.played.map((note) => note.pitch)).not.toContain(60);
    expect(scheduler.skippedLateNotes).toBeGreaterThan(0);
  });

  it("jumps back to the loop start", () => {
    const { audio, clock, scheduler } = setup();
    let looped = 0;
    scheduler.onLoop = () => looped++;
    scheduler.loop = { start: 2, end: 3 };
    clock.seek(2);
    clock.play();
    audio.advance(START_DELAY_S + 1.01);

    scheduler.tick();

    expect(looped).toBe(1);
    audio.advance(START_DELAY_S);
    expect(clock.scheduledSongTime()).toBeCloseTo(2);
  });
});

describe("PlayerEngine", () => {
  it("resumes the audio context, plays, pauses and clamps seeks", async () => {
    const audio = new FakeAudio();
    const engine = new PlayerEngine(timeline(), audio, new RecordingOutput());

    await engine.play();
    expect(audio.resumed).toBe(1);
    expect(engine.isPlaying).toBe(true);

    engine.pause();
    engine.seek(99);
    expect(engine.position).toBe(10);
    engine.seek(-5);
    expect(engine.position).toBe(0);
  });

  it("restarts from the beginning when play is pressed at the end", async () => {
    const audio = new FakeAudio();
    const engine = new PlayerEngine(timeline(), audio, new RecordingOutput());
    engine.seek(10);

    await engine.play();
    audio.advance(START_DELAY_S);

    expect(engine.position).toBeCloseTo(0);
  });

  it("moves into a loop that does not contain the position", () => {
    const engine = new PlayerEngine(timeline(), new FakeAudio(), new RecordingOutput());
    engine.seek(8);

    engine.setLoop({ start: 2, end: 4 });

    expect(engine.position).toBe(2);
  });
});
