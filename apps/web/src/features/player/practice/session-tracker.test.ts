import { describe, expect, it } from "vitest";
import { SessionTracker } from "./session-tracker";

describe("SessionTracker", () => {
  it("counts only playing time and keeps the speed range", () => {
    let now = 1000;
    const tracker = new SessionTracker(() => now);

    tracker.playing(75);
    now += 8000;
    tracker.paused();
    now += 60_000;
    tracker.playing(50);
    now += 4000;

    expect(tracker.activeMs).toBe(12_000);
    expect(tracker.snapshot()).toEqual({
      startedAt: 1000,
      endedAt: now,
      activeMs: 12_000,
      minTempoPct: 50,
      maxTempoPct: 75,
    });
  });

  it("does not record sessions shorter than 10 s", () => {
    let now = 0;
    const tracker = new SessionTracker(() => now);

    tracker.playing(100);
    now += 9_999;

    expect(tracker.snapshot()).toBeNull();
  });

  it("ignores repeated play and pause notifications", () => {
    let now = 0;
    const tracker = new SessionTracker(() => now);

    tracker.playing(100);
    now += 5000;
    tracker.playing(100);
    now += 5000;
    tracker.paused();
    tracker.paused();

    expect(tracker.activeMs).toBe(10_000);
  });
});
