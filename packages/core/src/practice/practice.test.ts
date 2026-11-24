import { describe, expect, it } from "vitest";
import type { PlayableNote } from "../timeline";
import { EARLY_S, WaitTracker, waitPoints } from "./index";

const note = (pitch: number, start: number, hand: "left" | "right"): PlayableNote => ({
  pitch,
  start,
  end: start + 0.4,
  soundEnd: start + 0.5,
  velocity: 0.8,
  hand,
});

describe("waitPoints", () => {
  const notes = [
    note(48, 0, "left"),
    note(64, 0.02, "right"),
    note(60, 0.03, "right"),
    note(67, 0.5, "right"),
    note(43, 1, "left"),
  ];

  it("groups the notes of the hands practised into chords", () => {
    expect(waitPoints(notes, ["left", "right"])).toEqual([
      { time: 0, pitches: [48, 60, 64] },
      { time: 0.5, pitches: [67] },
      { time: 1, pitches: [43] },
    ]);
  });

  it("leaves out the other hand", () => {
    expect(waitPoints(notes, ["right"])).toEqual([
      { time: 0.02, pitches: [60, 64] },
      { time: 0.5, pitches: [67] },
    ]);
  });
});

describe("WaitTracker", () => {
  const points = [
    { time: 1, pitches: [60, 64] },
    { time: 2, pitches: [67] },
  ];

  it("counts a chord from notes heard once it is close, and moves on", () => {
    const tracker = new WaitTracker(points);
    // Too early: the notes do not count yet.
    tracker.update(0, 1, 10);
    tracker.noteHeard(60, 10);
    tracker.update(1 - EARLY_S, 1, 10.5);
    expect(tracker.missing()).toEqual([60, 64]);

    tracker.noteHeard(60, 10.6);
    tracker.noteHeard(64, 10.7);
    expect(tracker.satisfied).toBe(true);
    tracker.advance();
    expect(tracker.current).toEqual({ time: 2, pitches: [67] });
    expect(tracker.satisfied).toBe(false);
  });

  it("waits longer ahead when slowed down (real seconds)", () => {
    const tracker = new WaitTracker(points);
    tracker.update(1 - EARLY_S, 0.5, 10);
    tracker.noteHeard(60, 10.1);
    tracker.noteHeard(64, 10.1);
    expect(tracker.satisfied).toBe(false);
    tracker.update(1 - EARLY_S / 2, 0.5, 10.2);
    tracker.noteHeard(60, 10.3);
    tracker.noteHeard(64, 10.3);
    expect(tracker.satisfied).toBe(true);
  });

  it("starts again from the chord at or after a seek, and ends", () => {
    const tracker = new WaitTracker(points);
    tracker.seek(1.5);
    expect(tracker.current?.time).toBe(2);
    tracker.seek(1);
    expect(tracker.current?.time).toBe(1);
    tracker.seek(3);
    expect(tracker.current).toBeNull();
    expect(tracker.satisfied).toBe(false);
  });
});
