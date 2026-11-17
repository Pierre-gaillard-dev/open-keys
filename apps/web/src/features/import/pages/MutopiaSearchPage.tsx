import type { MutopiaPiece } from "@open-keys/contracts";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, CloudOff, LoaderCircle, Play, Search, Square } from "lucide-react";
import { useEffect, useState } from "react";
import { cx } from "../../../shared/lib/cx";
import { useDebouncedValue } from "../../../shared/lib/use-debounced-value";
import { useIsOnline } from "../../../shared/offline";
import { Button, ErrorBanner } from "../../../shared/ui";
import { type MidiPreview, useMidiPreview } from "../../player";
import { fetchMutopiaMidi } from "../api/mutopia.api";
import { useImportMutopiaPiece, useMutopiaSearch } from "../api/mutopia.queries";
import { ImportError } from "../components/ImportError";
import { ImportTabs } from "../components/ImportTabs";

const SEARCH_DEBOUNCE_MS = 250;
const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short" });

/** Columns of a result row on a large screen (mockup pc-04); stacked on a phone. */
const COLUMNS =
  "md:grid md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_4rem_15rem] md:gap-4";

export interface MutopiaSearchPageProps {
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
}

interface PieceRowProps {
  readonly piece: MutopiaPiece;
  readonly preview: MidiPreview;
  readonly importing: boolean;
  readonly onImport: () => void;
}

function PreviewButton({ piece, preview }: Pick<PieceRowProps, "piece" | "preview">) {
  const state = preview.current?.key === String(piece.id) ? preview.current.status : null;
  const label = state === null ? `Écouter ${piece.title}` : `Arrêter ${piece.title}`;
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={state !== null}
      onClick={() => preview.toggle(String(piece.id), () => fetchMutopiaMidi(piece.id))}
      className="flex h-11 items-center gap-2 rounded-xl bg-surface-2 px-3 text-sm font-semibold"
    >
      {state === "loading" && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
      {state === "playing" && <Square aria-hidden="true" className="size-3.5 fill-current" />}
      {state === null && <Play aria-hidden="true" className="size-3.5 fill-current" />}
      <span className="hidden md:inline">{state === null ? "Écouter" : "Arrêter"}</span>
    </button>
  );
}

function PieceRow({ piece, preview, importing, onImport }: PieceRowProps) {
  const year = piece.publishedAt === null ? null : new Date(piece.publishedAt).getUTCFullYear();
  return (
    <li className={cx("flex items-center gap-3 px-4 py-3.5 md:items-center md:px-6", COLUMNS)}>
      <div className="flex min-w-0 flex-1 flex-col md:contents">
        <span className="truncate font-semibold">{piece.title}</span>
        <span className="truncate text-sm text-fg-muted md:text-base md:text-fg-soft">
          {piece.composer}
          {piece.opus && <span className="text-fg-muted"> · {piece.opus}</span>}
          <span className="md:hidden"> · {piece.license}</span>
        </span>
        <span className="hidden truncate text-fg-soft md:block">{piece.instrument}</span>
        <span className="hidden truncate text-fg-soft md:block">{piece.license}</span>
        <span className="hidden text-fg-muted md:block">{year}</span>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-2">
        <PreviewButton piece={piece} preview={preview} />
        {piece.songId ? (
          <Link
            to="/songs/$songId"
            params={{ songId: piece.songId }}
            className="w-28 text-center text-sm font-semibold text-fg-muted hover:text-fg"
          >
            Dans le catalogue
          </Link>
        ) : (
          <Button
            variant="primary"
            className="w-28"
            aria-label={`Importer ${piece.title}`}
            disabled={importing}
            onClick={onImport}
          >
            {importing ? "Analyse…" : "Importer"}
          </Button>
        )}
      </div>
    </li>
  );
}

function ResultsSummary({
  total,
  shown,
  syncedAt,
}: {
  total: number;
  shown: number;
  syncedAt: number | null;
}) {
  return (
    <div className="flex flex-col gap-1 text-sm text-fg-muted md:flex-row md:justify-between">
      <p aria-live="polite">
        {total} résultat{total > 1 ? "s" : ""}
        {total > shown && ` · ${shown} premiers affichés, précise la recherche`}
      </p>
      <p>
        {syncedAt === null
          ? "L'index Mutopia est en cours de création, il sera disponible dans quelques minutes."
          : `Index Mutopia mis à jour le ${dateFormat.format(syncedAt)}`}
      </p>
    </div>
  );
}

/**
 * UC-20: search the free Mutopia Project library (local index of the API), listen to a piece, import
 * it through the usual review screen with its title, composer and licence pre-filled.
 */
export function MutopiaSearchPage({ query, onQueryChange }: MutopiaSearchPageProps) {
  const [text, setText] = useState(query);
  const [solo, setSolo] = useState(true);
  const debounced = useDebouncedValue(text.trim(), SEARCH_DEBOUNCE_MS);
  const online = useIsOnline();
  const results = useMutopiaSearch(debounced, solo);
  const importPiece = useImportMutopiaPiece();
  const preview = useMidiPreview();
  const navigate = useNavigate();

  useEffect(() => {
    if (debounced !== query) {
      onQueryChange(debounced);
    }
  }, [debounced, query, onQueryChange]);

  const onImport = (id: number) =>
    importPiece.mutate(id, {
      onSuccess: (song) => void navigate({ to: "/import/$songId", params: { songId: song.id } }),
    });

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 px-4 py-5 md:px-10 md:py-10">
      <Link
        to="/import"
        className="flex items-center gap-1 self-start py-2 text-sm text-fg-muted hover:text-fg md:hidden"
      >
        <ChevronLeft aria-hidden="true" className="size-4" /> Importer
      </Link>
      <h1 className="font-display text-3xl font-bold tracking-tight">Rechercher en ligne</h1>
      <ImportTabs />

      <div className="flex flex-col gap-3 md:flex-row">
        <label className="flex h-12 flex-1 items-center gap-2.5 rounded-2xl border border-line bg-surface px-3.5 focus-within:border-hand-left">
          <Search aria-hidden="true" className="size-4 text-fg-muted" />
          <span className="sr-only">Rechercher dans Mutopia</span>
          <input
            type="search"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Titre, compositeur, opus…"
            className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-fg-muted"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-fg-muted">
          Instrumentation
          <select
            value={solo ? "solo" : "all"}
            onChange={(event) => setSolo(event.target.value === "solo")}
            className="h-12 flex-1 rounded-2xl border border-line bg-surface px-3 text-fg-soft md:flex-none"
          >
            <option value="solo">Piano seul</option>
            <option value="all">Avec piano (chant, duos…)</option>
          </select>
        </label>
      </div>

      {!online && (
        <p
          role="status"
          className="flex items-center gap-2.5 rounded-2xl border border-line bg-surface px-4 py-3 text-sm"
        >
          <CloudOff aria-hidden="true" className="size-4 shrink-0 text-hand-right" />
          La recherche en ligne nécessite une connexion.
        </p>
      )}
      {importPiece.error && <ImportError error={importPiece.error} />}
      {preview.error !== null && <ErrorBanner error={preview.error} title="Écoute impossible" />}
      {results.error && <ErrorBanner error={results.error} title="Recherche impossible" />}

      {results.data && (
        <>
          <ResultsSummary
            total={results.data.total}
            shown={results.data.pieces.length}
            syncedAt={results.data.syncedAt}
          />
          {results.data.pieces.length > 0 && (
            <section aria-label="Résultats Mutopia" className="rounded-3xl border border-line bg-surface">
              <div
                aria-hidden="true"
                className={cx(
                  "hidden border-b border-line px-6 py-3 text-xs font-semibold text-fg-muted md:grid",
                  COLUMNS,
                )}
              >
                <span>Titre</span>
                <span>Compositeur</span>
                <span>Instrument</span>
                <span>Licence</span>
                <span>Ajout</span>
              </div>
              <ul className="divide-y divide-line">
                {results.data.pieces.map((piece) => (
                  <PieceRow
                    key={piece.id}
                    piece={piece}
                    preview={preview}
                    importing={importPiece.isPending && importPiece.variables === piece.id}
                    onImport={() => onImport(piece.id)}
                  />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      <p className="text-xs text-fg-muted">
        Partitions et fichiers MIDI du{" "}
        <a href="https://www.mutopiaproject.org/" className="text-fg-soft underline hover:text-fg">
          Mutopia Project
        </a>
        , libres de droits ou sous licence Creative Commons.
      </p>
    </div>
  );
}
