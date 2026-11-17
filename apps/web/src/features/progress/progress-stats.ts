import type { PracticeHistoryEntry } from "@open-keys/contracts";

/** Practice of a period (a day or a week), in the time zone of the device. */
export interface PeriodTotal {
  /** Local midnight starting the period. */
  readonly start: Date;
  readonly activeMs: number;
  readonly sessions: number;
}

type Session = Pick<PracticeHistoryEntry, "startedAt" | "activeMs">;

export const DAYS_SHOWN = 30;
export const WEEKS_SHOWN = 12;

/** Local midnight of the day of `time`. */
export function startOfDay(time: number | Date): Date {
  const day = new Date(time);
  day.setHours(0, 0, 0, 0);
  return day;
}

/** Local midnight of the Monday of the week of `time`. */
export function startOfWeek(time: number | Date): Date {
  const day = startOfDay(time);
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  return day;
}

/** `count` periods ending with the one containing `now`, each starting `step` after the previous. */
function periods(
  now: number,
  count: number,
  first: (time: number) => Date,
  step: (date: Date) => Date,
): Date[] {
  const starts: Date[] = [];
  let start = first(now);
  for (let i = 0; i < count; i++) {
    starts.unshift(start);
    start = step(start);
  }
  return starts;
}

const previousDay = (date: Date) => {
  const day = new Date(date);
  day.setDate(day.getDate() - 1);
  return day;
};

const previousWeek = (date: Date) => {
  const week = new Date(date);
  week.setDate(week.getDate() - 7);
  return week;
};

function totals(
  sessions: readonly Session[],
  starts: readonly Date[],
  keyOf: (time: number) => number,
): PeriodTotal[] {
  const byPeriod = new Map(starts.map((start) => [start.getTime(), { activeMs: 0, sessions: 0 }]));
  for (const session of sessions) {
    const period = byPeriod.get(keyOf(session.startedAt));
    if (period) {
      period.activeMs += session.activeMs;
      period.sessions++;
    }
  }
  return starts.map((start) => ({
    start,
    ...(byPeriod.get(start.getTime()) ?? { activeMs: 0, sessions: 0 }),
  }));
}

/** The last `days` days (today included), oldest first. */
export function dailyTotals(sessions: readonly Session[], now: number, days = DAYS_SHOWN): PeriodTotal[] {
  return totals(sessions, periods(now, days, startOfDay, previousDay), (time) => startOfDay(time).getTime());
}

/** The last `weeks` weeks (Monday to Sunday, this one included), oldest first. */
export function weeklyTotals(sessions: readonly Session[], now: number, weeks = WEEKS_SHOWN): PeriodTotal[] {
  return totals(sessions, periods(now, weeks, startOfWeek, previousWeek), (time) =>
    startOfWeek(time).getTime(),
  );
}

/** Days in a row with some practice, ending today (or yesterday: today is not over). */
export function currentStreak(sessions: readonly Session[], now: number): number {
  const practiced = new Set(sessions.map((session) => startOfDay(session.startedAt).getTime()));
  let day = startOfDay(now);
  if (!practiced.has(day.getTime())) {
    day = previousDay(day);
  }
  let streak = 0;
  while (practiced.has(day.getTime())) {
    streak++;
    day = previousDay(day);
  }
  return streak;
}

/** Practice time per song over the sessions given. */
export function timeBySong(
  sessions: readonly Pick<PracticeHistoryEntry, "songId" | "activeMs">[],
): Map<string, number> {
  const bySong = new Map<string, number>();
  for (const session of sessions) {
    bySong.set(session.songId, (bySong.get(session.songId) ?? 0) + session.activeMs);
  }
  return bySong;
}
