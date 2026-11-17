import { Link } from "@tanstack/react-router";
import { Music, Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { cx } from "../../../shared/lib/cx";
import { useDebouncedValue } from "../../../shared/lib/use-debounced-value";
import { buttonClasses, ErrorBanner } from "../../../shared/ui";
import { useSongs } from "../api/catalog.queries";
import type { CatalogSearch } from "../catalog-search";
import { CatalogFilters } from "../components/CatalogFilters";
import { SongCard } from "../components/SongCard";

const SEARCH_DEBOUNCE_MS = 250;

export interface CatalogPageProps {
  readonly search: CatalogSearch;
  readonly onSearchChange: (search: CatalogSearch) => void;
}

function EmptyCatalog({ filtered }: { readonly filtered: boolean }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-3xl border border-dashed border-line-strong px-6 py-16 text-center">
      <Music aria-hidden="true" className="size-10 text-fg-muted" />
      {filtered ? (
        <p className="text-fg-soft">Aucun morceau ne correspond à ces filtres.</p>
      ) : (
        <>
          <p className="text-fg-soft">Ton catalogue est vide. Importe un premier morceau MIDI.</p>
          <Link to="/import" className={buttonClasses("primary")}>
            <Plus aria-hidden="true" className="size-4" /> Importer
          </Link>
        </>
      )}
    </div>
  );
}

export function CatalogPage({ search, onSearchChange }: CatalogPageProps) {
  const [text, setText] = useState(search.q ?? "");
  const debouncedText = useDebouncedValue(text, SEARCH_DEBOUNCE_MS);
  const songs = useSongs(search);
  const isFiltered = Boolean(search.q || search.view || search.tags);

  useEffect(() => {
    if ((debouncedText || undefined) !== search.q) {
      onSearchChange({ ...search, q: debouncedText || undefined });
    }
  }, [debouncedText, search, onSearchChange]);

  return (
    <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-5 px-4 py-5 md:px-10 md:py-8">
      <header className="flex flex-col gap-4 md:flex-row md:items-center">
        <h1 className="font-display text-3xl font-bold tracking-tight md:flex-1">Catalogue</h1>
        <label className="flex h-12 items-center gap-2.5 rounded-2xl border border-line bg-surface px-3.5 focus-within:border-hand-left md:w-96">
          <Search aria-hidden="true" className="size-4 text-fg-muted" />
          <span className="sr-only">Rechercher</span>
          <input
            type="search"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Titre, compositeur…"
            className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-fg-muted"
          />
        </label>
        <Link to="/import" className={cx(buttonClasses("primary"), "hidden md:inline-flex")}>
          <Plus aria-hidden="true" className="size-4" /> Importer
        </Link>
      </header>

      <CatalogFilters search={search} onChange={onSearchChange} />

      {songs.error && <ErrorBanner error={songs.error} title="Impossible de charger le catalogue" />}
      {songs.data && songs.data.length === 0 && <EmptyCatalog filtered={isFiltered} />}
      {songs.data && songs.data.length > 0 && (
        <section aria-label="Morceaux" className="flex flex-col gap-3">
          <p className="text-xs font-semibold tracking-[0.08em] text-fg-muted uppercase">
            {songs.data.length} morceau{songs.data.length > 1 ? "x" : ""}
          </p>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 md:grid-cols-5 md:gap-x-5 xl:grid-cols-7">
            {songs.data.map((song) => (
              <li key={song.id}>
                <SongCard song={song} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <Link
        to="/import"
        className={cx(
          buttonClasses("primary", "lg"),
          "fixed right-4 bottom-6 rounded-full shadow-2xl shadow-black/50 md:hidden",
        )}
      >
        <Plus aria-hidden="true" className="size-5" /> Importer
      </Link>
    </div>
  );
}
