import {
  LIBRARY_SOURCES,
  type LibrarySource,
  type SourcePiece,
  type SourceStatus,
} from "@open-keys/contracts";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, CloudOff, LoaderCircle, Play, Search, Square } from "lucide-react";
import { useEffect, useState } from "react";
import { cx } from "../../../shared/lib/cx";
import { formatDuration } from "../../../shared/lib/format";
import { useDebouncedValue } from "../../../shared/lib/use-debounced-value";
import { useIsOnline } from "../../../shared/offline";
import { Button, ErrorBanner } from "../../../shared/ui";
import { LIBRARY_SOURCE_LABELS } from "../../catalog";
import { type MidiPreview, useMidiPreview } from "../../player";
import { fetchSourceMidi } from "../api/sources.api";
import { useImportSourcePiece, useSourcesSearch } from "../api/sources.queries";
import { ImportError } from "../components/ImportError";
import { ImportTabs } from "../components/ImportTabs";

const SEARCH_DEBOUNCE_MS = 250;
const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short" });

/** Columns of a result row on a large screen (mockup pc-04); stacked on a phone. */
const COLUMNS =
  "md:grid md:grid-cols-[minmax(0,2.4fr)_minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_15rem] md:gap-4";

const SELECT = "h-12 flex-1 rounded-2xl border border-line bg-surface px-3 text-fg-soft md:flex-none";

/** Where the libraries come from, linked from the page (credit). */
const LIBRARY_HOMES: Readonly<Record<LibrarySource, string>> = {
  mutopia: "https://www.mutopiaproject.org/",
  maestro: "https://magenta.tensorflow.org/datasets/maestro",
  xivmidi: "https://xivmidi.com/",
};

export interface OnlineSearchPageProps {
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
}

interface PieceRowProps {
  readonly piece: SourcePiece;
  readonly preview: MidiPreview;
  readonly importing: boolean;
  readonly onImport: () => void;
}

function PreviewButton({ piece, preview }: Pick<PieceRowProps, "piece" | "preview">) {
  const state = preview.current?.key === piece.id ? preview.current.status : null;
  return (
    <button
      type="button"
      aria-label={state === null ? `Écouter ${piece.title}` : `Arrêter ${piece.title}`}
      aria-pressed={state !== null}
      onClick={() => preview.toggle(piece.id, () => fetchSourceMidi(piece.id))}
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
  const library = LIBRARY_SOURCE_LABELS[piece.source];
  // Unknown composers ("Unknown", missing artist) are common in community libraries: left out.
  const composer = piece.composer && !/^unknown$/i.test(piece.composer) ? piece.composer : null;
  const details = [
    composer,
    piece.opus,
    piece.durationMs === null ? null : formatDuration(piece.durationMs),
  ].filter(Boolean);
  return (
    <li className={cx("flex items-center gap-3 px-4 py-3.5 md:px-6", COLUMNS)}>
      <div className="flex min-w-0 flex-1 flex-col md:contents">
        <span className="flex min-w-0 flex-col">
          <span className="line-clamp-2 font-semibold md:truncate">{piece.title}</span>
          {piece.credit && <span className="truncate text-xs text-fg-muted">{piece.credit}</span>}
        </span>
        <span className="truncate text-sm text-fg-muted md:text-base md:text-fg-soft">
          {details.join(" · ")}
          <span className="md:hidden">
            {details.length > 0 && " · "}
            {library}
          </span>
        </span>
        <span className="hidden truncate text-fg-soft md:block">{piece.instrument}</span>
        <span className="hidden truncate text-fg-soft md:block">{library}</span>
        <span className="hidden truncate text-fg-soft md:block">{piece.license ?? "—"}</span>
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

const countFormat = new Intl.NumberFormat("fr-FR");

/** "Mutopia Project 744 · MAESTRO 1 276 · xivmidi (index en cours de création) · à jour au 14/11/2026" */
function statusText(sources: readonly SourceStatus[]): string {
  const counts = sources.map(
    (status) =>
      `${LIBRARY_SOURCE_LABELS[status.source]} ${
        status.syncedAt === null ? "(index en cours de création)" : countFormat.format(status.pieceCount)
      }`,
  );
  const synced = sources.flatMap((status) => (status.syncedAt === null ? [] : [status.syncedAt]));
  // The oldest index: every library is at least as fresh.
  const date = synced.length > 0 ? ` · à jour au ${dateFormat.format(Math.min(...synced))}` : "";
  return `${counts.join(" · ")}${date}`;
}

function ResultsSummary({
  total,
  shown,
  sources,
}: {
  total: number;
  shown: number;
  sources: readonly SourceStatus[];
}) {
  return (
    <div className="flex flex-col gap-1 text-sm text-fg-muted md:flex-row md:justify-between md:gap-6">
      <p aria-live="polite" className="shrink-0">
        {total} résultat{total > 1 ? "s" : ""}
        {total > shown && ` · ${shown} premiers affichés, précise la recherche`}
      </p>
      <p className="md:text-right">{statusText(sources)}</p>
    </div>
  );
}

/**
 * UC-20: search the online libraries (local indexes of the API), listen to a piece, import it through
 * the usual review screen with what the library knows pre-filled (title, composer, licence, credit).
 */
export function OnlineSearchPage({ query, onQueryChange }: OnlineSearchPageProps) {
  const [text, setText] = useState(query);
  const [source, setSource] = useState<LibrarySource | undefined>(undefined);
  const [solo, setSolo] = useState(true);
  const q = useDebouncedValue(text.trim(), SEARCH_DEBOUNCE_MS);
  const online = useIsOnline();
  const results = useSourcesSearch({ q, source, solo });
  const importPiece = useImportSourcePiece();
  const preview = useMidiPreview();
  const navigate = useNavigate();

  useEffect(() => {
    if (q !== query) {
      onQueryChange(q);
    }
  }, [q, query, onQueryChange]);

  const onImport = (id: string) =>
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
          <span className="sr-only">Rechercher dans les bibliothèques en ligne</span>
          <input
            type="search"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Titre, compositeur, artiste, arrangeur…"
            className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-fg-muted"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-fg-muted">
          Source
          <select
            value={source ?? "all"}
            onChange={(event) => setSource(LIBRARY_SOURCES.find((value) => value === event.target.value))}
            className={SELECT}
          >
            <option value="all">Toutes les sources</option>
            {LIBRARY_SOURCES.map((value) => (
              <option key={value} value={value}>
                {LIBRARY_SOURCE_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-fg-muted">
          Formation
          <select
            value={solo ? "solo" : "all"}
            onChange={(event) => setSolo(event.target.value === "solo")}
            className={SELECT}
          >
            <option value="solo">Solo</option>
            <option value="all">Tout (ensembles, chant…)</option>
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
            sources={results.data.sources}
          />
          {results.data.pieces.length > 0 && (
            <section aria-label="Résultats en ligne" className="rounded-3xl border border-line bg-surface">
              <div
                aria-hidden="true"
                className={cx(
                  "hidden border-b border-line px-6 py-3 text-xs font-semibold text-fg-muted md:grid",
                  COLUMNS,
                )}
              >
                <span>Titre</span>
                <span>Compositeur</span>
                <span>Instruments</span>
                <span>Source</span>
                <span>Licence</span>
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
        Fichiers des bibliothèques{" "}
        {LIBRARY_SOURCES.map((value, index) => (
          <span key={value}>
            {index > 0 && ", "}
            <a href={LIBRARY_HOMES[value]} className="text-fg-soft underline hover:text-fg">
              {LIBRARY_SOURCE_LABELS[value]}
            </a>
          </span>
        ))}
        , crédités sur chaque morceau importé.
      </p>
    </div>
  );
}
