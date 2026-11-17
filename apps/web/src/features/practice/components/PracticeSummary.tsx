import { cx } from "../../../shared/lib/cx";
import { formatDuration, formatPracticeTime, formatRelativeDay } from "../../../shared/lib/format";
import { SectionTitle } from "../../../shared/ui";
import { useLoops, usePracticeStats } from "../api/practice.queries";

interface StatProps {
  readonly value: string;
  readonly label: string;
  readonly className?: string;
}

function Stat({ value, label, className }: StatProps) {
  return (
    <div
      className={cx("flex min-w-0 flex-col gap-1 rounded-2xl border border-line bg-surface p-4", className)}
    >
      <span className="font-display text-2xl font-semibold [overflow-wrap:anywhere]">{value}</span>
      <span className="text-sm text-fg-muted">{label}</span>
    </div>
  );
}

/** Practice time, sessions and saved loops of the current user for a song (UC-16). */
export function PracticeSummary({ songId }: { readonly songId: string }) {
  const stats = usePracticeStats(songId);
  const loops = useLoops(songId);
  const data = stats.data;

  return (
    <div className="flex flex-col gap-6">
      {/* Three columns only when they are wide enough for "Aujourd'hui" (container width, not screen). */}
      <div className="@container">
        <div className="grid grid-cols-2 gap-2 @xl:grid-cols-3 md:gap-3">
          <Stat value={data ? formatPracticeTime(data.totalActiveMs) : "—"} label="pratiqué" />
          <Stat value={data ? String(data.sessionCount) : "—"} label="sessions" />
          <Stat
            value={data?.lastPracticedAt ? formatRelativeDay(data.lastPracticedAt) : "Jamais"}
            label="dernière fois"
            className="col-span-2 @xl:col-span-1"
          />
        </div>
      </div>

      <section className="flex flex-col gap-2.5">
        <SectionTitle>Boucles enregistrées</SectionTitle>
        {loops.data && loops.data.length > 0 ? (
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {loops.data.map((loop) => (
              <li key={loop.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex flex-col">
                  <span className="font-medium">{loop.name ?? "Boucle sans nom"}</span>
                  <span className="text-xs text-fg-muted">
                    {formatDuration(loop.startMs)} – {formatDuration(loop.endMs)}
                  </span>
                </div>
                {loop.bestTempoPct !== null && (
                  <span className="text-sm font-semibold text-fg-soft">{loop.bestTempoPct} %</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-fg-muted">Les boucles se créent depuis le lecteur.</p>
        )}
      </section>
    </div>
  );
}
