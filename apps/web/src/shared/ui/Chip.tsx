import type { ButtonHTMLAttributes } from "react";
import { cx } from "../lib/cx";

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly selected: boolean;
}

/** Toggle filter (aria-pressed). */
export function Chip({ selected, className, type = "button", ...props }: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={cx(
        "h-9 shrink-0 rounded-full border px-3.5 text-sm font-medium transition-colors",
        selected ? "border-fg bg-fg text-bg" : "border-line bg-surface text-fg-soft hover:border-line-strong",
        className,
      )}
      {...props}
    />
  );
}
