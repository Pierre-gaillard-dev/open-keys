import { extendTailwindMerge } from "tailwind-merge";

/** Knows the custom colour tokens of global.css, so that e.g. bg-surface and bg-fg conflict. */
const merge = extendTailwindMerge({
  extend: {
    theme: {
      color: [
        "bg",
        "surface",
        "surface-2",
        "line",
        "line-strong",
        "fg",
        "fg-soft",
        "fg-muted",
        "hand-left",
        "hand-right",
        "success",
        "danger",
      ],
    },
  },
});

/**
 * Joins class names, skipping falsy values. Conflicting Tailwind classes are resolved in favour of
 * the last one (a `className` prop overrides a component's defaults, e.g. w-24 over w-full).
 */
export function cx(...classes: (string | false | null | undefined)[]): string {
  return merge(classes.filter(Boolean).join(" "));
}
