import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "../lib/cx";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required: the button has no visible text. */
  readonly label: string;
  readonly children: ReactNode;
}

export function IconButton({ label, className, children, type = "button", ...props }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex size-11 items-center justify-center rounded-xl border border-line bg-surface text-fg",
        "transition-colors hover:border-line-strong disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
