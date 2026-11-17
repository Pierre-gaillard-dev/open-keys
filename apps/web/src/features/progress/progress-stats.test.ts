import { describe, expect, it } from "vitest";
import { currentStreak, dailyTotals, startOfWeek, timeBySong, weeklyTotals } from "./progress-stats";

/** Local time, like the device sees it. */
const at = (day: number, hour = 18) => new Date(2026, 10, day, hour).getTime();
const NOW = at(17, 20); // Tuesday 17 November 2026, 20:00

function session(day: number, minutes: number, songId = "S1", hour = 18) {
  return { startedAt: at(day, hour), activeMs: minutes * 60_000, songId };
}

describe("progress statistics", () => {
  it("adds the sessions of each day of the period, today included, oldest first", () => {
    const days = dailyTotals(
      [session(17, 10), session(17, 5, "S1", 7), session(15, 20), session(1, 99)],
      NOW,
      3,
    );

    expect(days.map((day) => [day.start.getDate(), day.activeMs / 60_000, day.sessions])).toEqual([
      [15, 20, 1],
      [16, 0, 0],
      [17, 15, 2],
    ]);
  });

  it("groups weeks from Monday", () => {
    expect(startOfWeek(NOW).getDate()).toBe(16);
    const weeks = weeklyTotals([session(16, 10), session(15, 30), session(9, 5)], NOW, 2);

    expect(weeks.map((week) => [week.start.getDate(), week.activeMs / 60_000])).toEqual([
      [9, 35],
      [16, 10],
    ]);
  });

  it("counts the days in a row, today not being over yet", () => {
    expect(currentStreak([session(17, 5), session(16, 5), session(15, 5), session(13, 5)], NOW)).toBe(3);
    expect(currentStreak([session(16, 5), session(15, 5)], NOW)).toBe(2);
    expect(currentStreak([session(14, 5)], NOW)).toBe(0);
  });

  it("adds the practice time of each song", () => {
    expect(timeBySong([session(17, 10), session(16, 5), session(16, 3, "S2")])).toEqual(
      new Map([
        ["S1", 15 * 60_000],
        ["S2", 3 * 60_000],
      ]),
    );
  });
});
