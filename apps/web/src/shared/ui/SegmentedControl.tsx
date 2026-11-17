import { cx } from "../lib/cx";

export interface SegmentedOption<Value extends string> {
  readonly value: Value;
  readonly label: string;
}

export interface SegmentedControlProps<Value extends string> {
  readonly label: string;
  readonly options: readonly SegmentedOption<Value>[];
  readonly value: Value;
  readonly onChange: (value: Value) => void;
  readonly disabled?: boolean;
}

/** Mutually exclusive choice (radio group) rendered as a segmented button bar. */
export function SegmentedControl<Value extends string>({
  label,
  options,
  value,
  onChange,
  disabled,
}: SegmentedControlProps<Value>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="grid gap-1 rounded-2xl border border-line bg-surface p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          // biome-ignore lint/a11y/useSemanticElements: a segmented control is a radio group of buttons (ARIA pattern)
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cx(
              "h-10 rounded-xl px-2 text-sm transition-colors disabled:opacity-50",
              selected ? "bg-line font-semibold text-fg" : "text-fg-muted hover:text-fg",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
