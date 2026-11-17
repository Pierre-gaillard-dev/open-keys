import { cx } from "../lib/cx";

export interface StatTileProps {
  readonly value: string;
  readonly label: string;
  readonly className?: string;
}

/** A headline number with its label (practice time, sessions…). */
export function StatTile({ value, label, className }: StatTileProps) {
  return (
    <div
      className={cx("flex min-w-0 flex-col gap-1 rounded-2xl border border-line bg-surface p-4", className)}
    >
      <span className="font-display text-2xl font-semibold [overflow-wrap:anywhere]">{value}</span>
      <span className="text-sm text-fg-muted">{label}</span>
    </div>
  );
}
