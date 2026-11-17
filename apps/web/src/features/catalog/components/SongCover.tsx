import type { Cover } from "@open-keys/contracts";
import { cx } from "../../../shared/lib/cx";

/** Muted tones of the mockups; the generated cover picks one from the song id. */
const GENERATED_TONES = [
  "#2b3a55",
  "#4a3426",
  "#24433f",
  "#3d2e4f",
  "#2f3b2a",
  "#3a2f3f",
  "#3b3524",
  "#26394a",
];

export function generatedTone(songId: string): string {
  let hash = 0;
  for (const char of songId) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return GENERATED_TONES[hash % GENERATED_TONES.length] ?? "#2b3a55";
}

export interface SongCoverProps {
  readonly songId: string;
  readonly title: string;
  readonly cover: Cover | null;
  readonly className?: string;
  /** Size of the title on the generated cover. */
  readonly titleClassName?: string;
}

/** Square cover: the stored WebP, or a generated one (tone + title) when there is none (UC-17). */
export function SongCover({ songId, title, cover, className, titleClassName }: SongCoverProps) {
  if (cover) {
    return (
      <img
        src={cover.url}
        alt={`Couverture de ${title}`}
        loading="lazy"
        className={cx("aspect-square w-full rounded-2xl object-cover", className)}
      />
    );
  }
  return (
    <div
      role="img"
      aria-label={`Couverture générée de ${title}`}
      className={cx("flex aspect-square w-full items-end rounded-2xl p-3", className)}
      style={{ backgroundColor: generatedTone(songId) }}
    >
      <span
        className={cx(
          "line-clamp-3 font-display leading-tight font-bold text-fg",
          titleClassName ?? "text-base",
        )}
      >
        {title}
      </span>
    </div>
  );
}
