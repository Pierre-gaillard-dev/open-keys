import type { PracticeHistoryEntry } from "@open-keys/contracts";
import { Link } from "@tanstack/react-router";
import { BarChart3 } from "lucide-react";
import { useMemo, useState } from "react";
import { formatPracticeTime, formatRelativeDay } from "../../../shared/lib/format";
import { ErrorBanner, SectionTitle, SegmentedControl, StatTile } from "../../../shared/ui";
import { useSongs } from "../../catalog";
import { usePracticeHistory } from "../api/progress.queries";
import { PracticeChart } from "../components/PracticeChart";
import { currentStreak, dailyTotals, timeBySong, weeklyTotals } from "../progress-stats";

type ChartRange = "days" | "weeks";

const RANGE_OPTIONS: readonly { value: ChartRange; label: string }[] = [
  { value: "days", label: "30 jours" },
  { value: "weeks", label: "12 semaines" },
];
const RECENT_SESSIONS = 15;

const dayNumber = new Intl.DateTimeFormat("fr-FR", { day: "numeric" });
const dayName = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const shortDate = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
const sessionDate = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const weekLabel = (start: Date) => `Semaine du ${dayName.format(start)}`;
const sum = (values: readonly { activeMs: number }[]) =>
  values.reduce((total, value) => total + value.activeMs, 0);

function SessionRow({ session }: { readonly session: PracticeHistoryEntry }) {
  const tempo =
    session.minTempoPct === session.maxTempoPct
      ? `${session.maxTempoPct} %`
      : `${session.minTempoPct}–${session.maxTempoPct} %`;
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-col">
        <Link
          to="/songs/$songId"
          params={{ songId: session.songId }}
          className="truncate font-semibold hover:underline"
        >
          {session.songTitle}
        </Link>
        <span className="text-xs text-fg-muted">{sessionDate.format(session.startedAt)}</span>
      </div>
      <span className="text-sm text-fg-muted tabular-nums">{tempo}</span>
      <span className="w-16 text-right font-semibold tabular-nums">
        {formatPracticeTime(session.activeMs)}
      </span>
    </li>
  );
}

/** UC-27: practice time per day and per week, songs being learned, recent sessions. */
export function ProgressPage() {
  const history = usePracticeHistory();
  const learning = useSongs({ view: "learning", sort: "practiced" });
  const [range, setRange] = useState<ChartRange>("days");
  const sessions = history.data?.sessions ?? [];

  const stats = useMemo(() => {
    const now = Date.now();
    const days = dailyTotals(sessions, now);
    return {
      days,
      weeks: weeklyTotals(sessions, now),
      lastWeek: sum(days.slice(-7)),
      lastMonth: sum(days),
      practicedDays: days.filter((day) => day.sessions > 0).length,
      streak: currentStreak(sessions, now),
      bySong: timeBySong(sessions),
    };
  }, [sessions]);

  return (
    <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-6 px-4 py-5 md:px-10 md:py-10">
      <h1 className="font-display text-3xl font-bold tracking-tight">Progression</h1>
      {history.error && !history.data && (
        <ErrorBanner error={history.error} title="Historique indisponible" />
      )}

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
        <StatTile value={formatPracticeTime(stats.lastWeek)} label="ces 7 derniers jours" />
        <StatTile value={formatPracticeTime(stats.lastMonth)} label="ces 30 derniers jours" />
        <StatTile value={`${stats.practicedDays} j`} label="de pratique sur 30" />
        <StatTile value={`${stats.streak} j`} label="d'affilée" />
      </div>

      <section
        aria-label="Temps de pratique"
        className="flex flex-col gap-4 rounded-3xl border border-line bg-surface p-4 md:p-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Temps de pratique {range === "days" ? "par jour" : "par semaine"}</h2>
          <div className="w-full sm:w-56">
            <SegmentedControl label="Période" options={RANGE_OPTIONS} value={range} onChange={setRange} />
          </div>
        </div>
        {range === "days" ? (
          <PracticeChart
            title="Temps de pratique par jour, 30 derniers jours"
            periods={stats.days}
            shortLabel={(start) => dayNumber.format(start)}
            longLabel={(start) => dayName.format(start)}
            labelEvery={5}
          />
        ) : (
          <PracticeChart
            title="Temps de pratique par semaine, 12 dernières semaines"
            periods={stats.weeks}
            shortLabel={(start) => shortDate.format(start)}
            longLabel={weekLabel}
            labelEvery={3}
          />
        )}
      </section>

      <section className="flex flex-col gap-2.5">
        <SectionTitle>En cours</SectionTitle>
        {learning.data && learning.data.length > 0 ? (
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {learning.data.map((song) => (
              <li key={song.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex min-w-0 flex-1 flex-col">
                  <Link
                    to="/songs/$songId"
                    params={{ songId: song.id }}
                    className="truncate font-semibold hover:underline"
                  >
                    {song.title}
                  </Link>
                  <span className="truncate text-xs text-fg-muted">
                    {song.library?.lastPracticedAt
                      ? `Pratiqué : ${formatRelativeDay(song.library.lastPracticedAt).toLowerCase()}`
                      : "Pas encore pratiqué"}
                  </span>
                </div>
                <span className="text-right text-sm text-fg-muted">
                  <span className="font-semibold text-fg tabular-nums">
                    {formatPracticeTime(stats.bySong.get(song.id) ?? 0)}
                  </span>{" "}
                  en 12 sem.
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-fg-muted">
            Aucun morceau en cours. Un morceau pratiqué passe « en cours ».
          </p>
        )}
      </section>

      <section className="flex flex-col gap-2.5">
        <SectionTitle>Dernières sessions</SectionTitle>
        {sessions.length > 0 ? (
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {sessions.slice(0, RECENT_SESSIONS).map((session) => (
              <SessionRow key={session.id} session={session} />
            ))}
          </ul>
        ) : (
          history.data && (
            <p className="flex items-center gap-2 text-sm text-fg-muted">
              <BarChart3 aria-hidden="true" className="size-4" />
              Les sessions de plus de 10 s apparaissent ici.
            </p>
          )
        )}
      </section>
    </div>
  );
}
