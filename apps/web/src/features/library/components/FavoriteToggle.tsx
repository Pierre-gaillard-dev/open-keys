import { Heart } from "lucide-react";
import { cx } from "../../../shared/lib/cx";
import { IconButton } from "../../../shared/ui";
import { useLibraryEntry, useUpdateLibraryEntry } from "../api/library.queries";

export function FavoriteToggle({ songId }: { readonly songId: string }) {
  const entry = useLibraryEntry(songId);
  const update = useUpdateLibraryEntry(songId);
  const isFavorite = entry.data?.isFavorite ?? false;
  return (
    <IconButton
      label={isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"}
      aria-pressed={isFavorite}
      disabled={entry.isPending}
      onClick={() => update.mutate({ isFavorite: !isFavorite })}
    >
      <Heart aria-hidden="true" className={cx("size-5", isFavorite && "fill-current")} />
    </IconButton>
  );
}
