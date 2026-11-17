import { type InputHTMLAttributes, useId } from "react";
import { cx } from "../lib/cx";

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly label: string;
  readonly error?: string | undefined;
  readonly hint?: string;
}

export function TextField({ label, error, hint, className, id, ...props }: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const messageId = `${inputId}-message`;
  const message = error ?? hint;
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={inputId} className="text-sm font-medium text-fg-soft">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={message ? messageId : undefined}
        className={cx(
          "h-12 rounded-xl border bg-surface px-3.5 text-base text-fg placeholder:text-fg-muted",
          error ? "border-danger" : "border-line focus:border-hand-left",
        )}
        {...props}
      />
      {message && (
        <p id={messageId} className={cx("text-xs", error ? "text-danger" : "text-fg-muted")}>
          {message}
        </p>
      )}
    </div>
  );
}
