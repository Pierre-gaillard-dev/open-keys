import { useState } from "react";
import { cx } from "../../../shared/lib/cx";
import { formatPracticeTime } from "../../../shared/lib/format";
import type { PeriodTotal } from "../progress-stats";

export interface PracticeChartProps {
  readonly title: string;
  readonly periods: readonly PeriodTotal[];
  /** Short label under a column ("17", "16 nov"). */
  readonly shortLabel: (start: Date) => string;
  /** Full name of a period, for the tooltip, the screen reader and the table. */
  readonly longLabel: (start: Date) => string;
  /** One axis label every `labelEvery` columns, counted from the last one (today). */
  readonly labelEvery: number;
}

const MINUTE = 60_000;
/** Clean top of the axis, in minutes. */
const AXIS_STEPS = [10, 20, 30, 60, 90, 120, 180, 240, 360, 480];

/** Near the edges the tooltip grows inwards, so it never leaves the chart (no horizontal scroll). */
function tooltipAnchor(index: number, count: number): string {
  const position = (index + 0.5) / count;
  if (position < 0.3) {
    return "-translate-x-4";
  }
  return position > 0.7 ? "-translate-x-[calc(100%-1rem)]" : "-translate-x-1/2";
}

function axisMaxMinutes(maxMs: number): number {
  const minutes = maxMs / MINUTE;
  return AXIS_STEPS.find((step) => step >= minutes) ?? Math.ceil(minutes / 60) * 60;
}

/**
 * Practice time per period (UC-27): one column per day or week, a single series (no legend: the title
 * names it). Each column is a button: hover or focus shows its value; the table view lists them all.
 */
export function PracticeChart({ title, periods, shortLabel, longLabel, labelEvery }: PracticeChartProps) {
  const [active, setActive] = useState<number | null>(null);
  const maxMs = Math.max(0, ...periods.map((period) => period.activeMs));
  const axisMax = axisMaxMinutes(maxMs);
  const peak = maxMs > 0 ? periods.findIndex((period) => period.activeMs === maxMs) : -1;
  const shown = active === null ? undefined : periods[active];

  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="sr-only">{title}</figcaption>
      <div className="flex gap-2">
        {/* Y axis: clean values, recessive. */}
        <div
          aria-hidden="true"
          className="flex h-40 flex-col justify-between text-right text-xs text-fg-muted"
        >
          <span>{formatPracticeTime(axisMax * MINUTE)}</span>
          <span>{formatPracticeTime((axisMax / 2) * MINUTE)}</span>
          <span>0</span>
        </div>
        <div className="relative flex-1">
          <div aria-hidden="true" className="absolute inset-0 flex flex-col justify-between">
            <span className="border-t border-line" />
            <span className="border-t border-line" />
            <span className="border-t border-line-strong" />
          </div>
          <div className="relative flex h-40 items-end gap-0.5">
            {periods.map((period, index) => {
              const heightPct = (period.activeMs / (axisMax * MINUTE)) * 100;
              return (
                <button
                  key={period.start.getTime()}
                  type="button"
                  aria-label={`${longLabel(period.start)} : ${formatPracticeTime(period.activeMs)}, ${period.sessions} session${period.sessions > 1 ? "s" : ""}`}
                  onPointerEnter={() => setActive(index)}
                  onPointerLeave={() => setActive(null)}
                  onFocus={() => setActive(index)}
                  onBlur={() => setActive(null)}
                  className="group relative flex h-full flex-1 items-end justify-center outline-none"
                >
                  {index === peak && active === null && (
                    <span
                      aria-hidden="true"
                      className="absolute -translate-y-1 text-xs font-semibold whitespace-nowrap text-fg-soft"
                      style={{ bottom: `${heightPct}%` }}
                    >
                      {formatPracticeTime(period.activeMs)}
                    </span>
                  )}
                  <span
                    className={cx(
                      "w-full max-w-6 rounded-t-[4px] bg-chart transition-[filter]",
                      active === index && "brightness-125",
                      "group-focus-visible:ring-2 group-focus-visible:ring-fg",
                    )}
                    style={{ height: `${heightPct}%`, minHeight: period.activeMs > 0 ? 2 : 0 }}
                  />
                </button>
              );
            })}
          </div>
          {shown && active !== null && (
            <div
              role="tooltip"
              className={cx(
                "pointer-events-none absolute z-10 flex flex-col rounded-xl border border-line bg-surface-2 px-3 py-2 text-xs whitespace-nowrap shadow-xl",
                tooltipAnchor(active, periods.length),
              )}
              style={{
                left: `${((active + 0.5) / periods.length) * 100}%`,
                // Just above the column, inside the plot: never over the controls above the chart.
                bottom: `calc(${Math.min(70, (shown.activeMs / (axisMax * MINUTE)) * 100)}% + 0.5rem)`,
              }}
            >
              <span className="text-sm font-semibold text-fg">{formatPracticeTime(shown.activeMs)}</span>
              <span className="text-fg-muted">
                {longLabel(shown.start)} · {shown.sessions} session{shown.sessions > 1 ? "s" : ""}
              </span>
            </div>
          )}
        </div>
      </div>
      <div aria-hidden="true" className="ml-10 flex gap-0.5 text-xs text-fg-muted">
        {periods.map((period, index) => (
          <span key={period.start.getTime()} className="flex-1 text-center whitespace-nowrap">
            {(periods.length - 1 - index) % labelEvery === 0 ? shortLabel(period.start) : ""}
          </span>
        ))}
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-fg-muted hover:text-fg">Voir les données</summary>
        <table className="mt-2 w-full text-left">
          <caption className="sr-only">{title}</caption>
          <thead className="text-xs text-fg-muted">
            <tr>
              <th scope="col" className="py-1 font-semibold">
                Période
              </th>
              <th scope="col" className="py-1 text-right font-semibold">
                Temps
              </th>
              <th scope="col" className="py-1 text-right font-semibold">
                Sessions
              </th>
            </tr>
          </thead>
          <tbody>
            {[...periods].reverse().map((period) => (
              <tr key={period.start.getTime()} className="border-t border-line">
                <td className="py-1">{longLabel(period.start)}</td>
                <td className="py-1 text-right tabular-nums">{formatPracticeTime(period.activeMs)}</td>
                <td className="py-1 text-right tabular-nums">{period.sessions}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
