import type { SongDetail } from "@open-keys/contracts";
import { ImagePlus, Link2, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { cx } from "../../../shared/lib/cx";
import { Button, ErrorBanner, TextField } from "../../../shared/ui";
import { SongCover } from "../../catalog";
import { useChangeCover, useCoverSuggestions } from "../api/import.queries";

export interface CoverPickerProps {
  readonly song: SongDetail;
  /** Current form values: suggestions are searched with them, not with the stored ones. */
  readonly title: string;
  readonly composer: string;
  readonly selectedSuggestionId: string | null;
  readonly onSelectSuggestion: (id: string | null) => void;
}

/**
 * Cover choice (UC-17). A suggestion is only selected here and saved with the form; an uploaded
 * file or a URL is applied immediately.
 */
export function CoverPicker({
  song,
  title,
  composer,
  selectedSuggestionId,
  onSelectSuggestion,
}: CoverPickerProps) {
  const [searching, setSearching] = useState(false);
  const [url, setUrl] = useState("");
  const suggestions = useCoverSuggestions(song.id, title, composer, searching);
  const change = useChangeCover(song.id);

  const applyUrl = () => {
    if (url && !change.isPending) {
      change.mutate({ kind: "set", request: { url } }, { onSuccess: () => setUrl("") });
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <SongCover
          songId={song.id}
          title={title || song.title}
          cover={song.cover}
          className="w-24"
          titleClassName="text-xs"
        />
        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{song.cover ? "Couverture actuelle" : "Couverture générée"}</span>
          {song.cover?.credit && <span className="text-xs text-fg-muted">{song.cover.credit}</span>}
          {song.cover && (
            <button
              type="button"
              onClick={() => change.mutate({ kind: "remove" })}
              className="flex items-center gap-1 self-start text-xs text-fg-muted hover:text-danger"
            >
              <Trash2 aria-hidden="true" className="size-3.5" /> Retirer
            </button>
          )}
        </div>
      </div>

      {searching && suggestions.data && (
        <div className="grid grid-cols-3 gap-2">
          {suggestions.data.length === 0 && (
            <p className="col-span-3 text-sm text-fg-muted">
              Aucune couverture trouvée pour ce titre et ce compositeur.
            </p>
          )}
          {suggestions.data.map((suggestion) => {
            const selected = suggestion.id === selectedSuggestionId;
            return (
              <button
                key={suggestion.id}
                type="button"
                aria-pressed={selected}
                onClick={() => onSelectSuggestion(selected ? null : suggestion.id)}
                className="flex flex-col gap-1.5 text-left"
              >
                <img
                  src={suggestion.thumbnailUrl}
                  alt={suggestion.label}
                  referrerPolicy="no-referrer"
                  className={cx(
                    "aspect-square w-full rounded-xl border-2 object-cover",
                    selected ? "border-fg" : "border-transparent",
                  )}
                />
                <span className={cx("text-xs", selected ? "font-semibold" : "text-fg-muted")}>
                  {suggestion.label}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {selectedSuggestionId && (
        <p className="text-xs text-fg-muted">La couverture choisie sera enregistrée avec le morceau.</p>
      )}

      <div className="grid grid-cols-1 gap-2">
        <Button onClick={() => setSearching(true)} disabled={suggestions.isFetching}>
          <Search aria-hidden="true" className="size-4" />
          {suggestions.isFetching ? "Recherche…" : "Chercher une couverture"}
        </Button>
        <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm font-semibold hover:border-line-strong">
          <ImagePlus aria-hidden="true" className="size-4" /> Choisir une image
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                change.mutate({ kind: "upload", file });
              }
              event.target.value = "";
            }}
          />
        </label>
      </div>
      {/* Not a <form>: the picker lives inside the song form (nested forms are invalid HTML, and Enter
          here would submit the whole import). */}
      <div className="flex items-end gap-2">
        <TextField
          label="Ou une URL d'image"
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              applyUrl();
            }
          }}
          placeholder="https://…"
          className="flex-1"
        />
        <Button
          type="button"
          disabled={!url || change.isPending}
          aria-label="Utiliser cette image"
          onClick={applyUrl}
        >
          <Link2 aria-hidden="true" className="size-4" />
        </Button>
      </div>
      {(change.error ?? suggestions.error) && <ErrorBanner error={change.error ?? suggestions.error} />}
    </div>
  );
}
