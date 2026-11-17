import type { ButtonHTMLAttributes } from "react";
import { cx } from "../lib/cx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-fg text-bg hover:bg-white",
  secondary: "border border-line bg-surface text-fg hover:border-line-strong",
  ghost: "text-fg-soft hover:bg-surface hover:text-fg",
  danger: "border border-danger/40 bg-surface text-danger hover:bg-danger/10",
};

const SIZES: Record<ButtonSize, string> = {
  md: "h-11 px-4 text-sm rounded-xl",
  lg: "h-14 px-6 text-base rounded-2xl",
};

/** Classes of a button, also used to style router links as buttons. */
export function buttonClasses(variant: ButtonVariant = "secondary", size: ButtonSize = "md"): string {
  return cx(
    "inline-flex items-center justify-center gap-2 font-semibold transition-colors",
    "disabled:cursor-not-allowed disabled:opacity-50",
    VARIANTS[variant],
    SIZES[size],
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
}

export function Button({ variant, size, className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={cx(buttonClasses(variant, size), className)} {...props} />;
}
