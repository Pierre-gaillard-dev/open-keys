import { describe, expect, it } from "vitest";
import { difficultyDots, formatDuration, formatPracticeTime, formatRelativeDay } from "./format";

describe("formatDuration", () => {
  it.each([
    [0, "0:00"],
    [9_000, "0:09"],
    [202_273, "3:22"],
    [3_600_000, "60:00"],
  ])("%i ms → %s", (ms, text) => {
    expect(formatDuration(ms)).toBe(text);
  });
});

describe("formatPracticeTime", () => {
  it.each([
    [0, "0 min"],
    [30_000, "< 1 min"],
    [18 * 60_000, "18 min"],
    [3 * 3_600_000, "3 h"],
    [3 * 3_600_000 + 12 * 60_000, "3 h 12"],
    [3_600_000 + 5 * 60_000, "1 h 05"],
  ])("%i ms → %s", (ms, text) => {
    expect(formatPracticeTime(ms)).toBe(text);
  });
});

describe("difficultyDots", () => {
  it("draws filled and empty dots", () => {
    expect(difficultyDots(2)).toBe("●●○○○");
    expect(difficultyDots(null)).toBe("—");
  });
});

describe("formatRelativeDay", () => {
  const now = Date.UTC(2026, 10, 17, 12);

  it.each([
    [now - 60_000, "Aujourd'hui"],
    [now - 24 * 3_600_000, "Hier"],
    [now - 3 * 24 * 3_600_000, "Il y a 3 jours"],
  ])("%i → %s", (timestamp, text) => {
    expect(formatRelativeDay(timestamp, now)).toBe(text);
  });

  it("falls back to a date after a week", () => {
    expect(formatRelativeDay(Date.UTC(2026, 9, 1), now)).toMatch(/1 oct\.? 2026/);
  });
});
