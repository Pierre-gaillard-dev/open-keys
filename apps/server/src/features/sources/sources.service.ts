import {
  LIBRARY_SOURCES,
  type LibrarySource,
  type SearchSourcesQuery,
  type SourcePiece,
  type SourcesSearchResult,
} from "@open-keys/contracts";
import type { Database } from "../../db";
import { AppError } from "../../shared/http";
import type { Logger } from "../../shared/logger";
import type { Clock } from "../../shared/runtime";
import type { ImportResult, ImportsService } from "../imports";
import type { ListedPiece, SourceProvider } from "./providers/source-provider.types";
import {
  countsBySource,
  deletePiecesSyncedBefore,
  type FoundPiece,
  findPiece,
  normalizeSearchText,
  searchPieces,
  upsertPieces,
} from "./sources.queries";
import type { NewSourcePieceRow } from "./sources.schema";

/** A whole synchronisation of one library must end within this delay (xivmidi: about 290 pages). */
const SYNC_TIMEOUT_MS = 30 * 60_000;
const MAX_RESULTS = 100;

export interface SourcesServiceDeps {
  readonly db: Database;
  readonly providers: readonly SourceProvider[];
  readonly imports: ImportsService;
  readonly clock: Clock;
  readonly logger: Logger;
}

export interface SyncReport {
  readonly source: LibrarySource;
  readonly pieces: number;
  readonly removed: number;
}

export type SourcesService = ReturnType<typeof createSourcesService>;

function toRow(source: LibrarySource, piece: ListedPiece, syncedAt: number): NewSourcePieceRow {
  return {
    ...piece,
    id: `${source}:${piece.externalId}`,
    source,
    searchText: normalizeSearchText(
      [piece.title, piece.composer, piece.opus, piece.credit].filter(Boolean).join(" "),
    ),
    syncedAt,
  };
}

function toPiece(row: FoundPiece): SourcePiece {
  return {
    id: row.id,
    source: row.source,
    title: row.title,
    composer: row.composer,
    opus: row.opus,
    instrument: row.instrument,
    solo: row.solo,
    style: row.style,
    license: row.license,
    credit: row.credit,
    durationMs: row.durationMs,
    publishedAt: row.publishedAt,
    songId: row.songId,
  };
}

/**
 * Online libraries (UC-20, D24): each provider's index is copied locally on its own schedule, then
 * searched across libraries; listening and importing go through the provider of the piece.
 */
export function createSourcesService(deps: SourcesServiceDeps) {
  const { db, imports, clock, logger } = deps;
  const providers = new Map(deps.providers.map((provider) => [provider.id, provider]));
  const running = new Map<LibrarySource, Promise<SyncReport>>();

  const runSync = async (provider: SourceProvider): Promise<SyncReport> => {
    const started = clock();
    const pieces = await provider.list(AbortSignal.timeout(SYNC_TIMEOUT_MS));
    if (pieces.length === 0) {
      // An empty listing is a broken page, not an empty library: keep the index.
      throw new Error(`${provider.id} listing is empty`);
    }
    const removed = db.transaction((tx) => {
      upsertPieces(
        tx,
        pieces.map((piece) => toRow(provider.id, piece, started)),
      );
      return deletePiecesSyncedBefore(tx, provider.id, started);
    });
    const report = { source: provider.id, pieces: pieces.length, removed };
    logger.info("Source index synchronised", { ...report, durationMs: clock() - started });
    return report;
  };

  const providerOf = (source: LibrarySource) => {
    const provider = providers.get(source);
    if (!provider) {
      throw new AppError("NOT_FOUND", `No provider for ${source}`);
    }
    return provider;
  };

  const pieceOrFail = (id: string) => {
    const piece = findPiece(db, id);
    if (!piece) {
      throw new AppError("NOT_FOUND", "Piece not found in the online libraries");
    }
    return piece;
  };

  return {
    /** Reads one library again; concurrent calls for the same library share the run. */
    sync(source: LibrarySource): Promise<SyncReport> {
      const current = running.get(source);
      if (current) {
        return current;
      }
      const run = runSync(providerOf(source)).finally(() => running.delete(source));
      running.set(source, run);
      return run;
    },

    /** Periodic job: each library whose index is missing or too old, one after the other. */
    async syncStale(): Promise<SyncReport[]> {
      const synced = new Map(countsBySource(db).map((count) => [count.source, count.syncedAt]));
      const reports: SyncReport[] = [];
      for (const provider of providers.values()) {
        const last = synced.get(provider.id) ?? null;
        if (last !== null && clock() - last < provider.maxAgeMs) {
          continue;
        }
        try {
          reports.push(await this.sync(provider.id));
        } catch (error) {
          // One library down must not keep the others from being synchronised.
          logger.warn("Source index not synchronised", { source: provider.id, error });
        }
      }
      return reports;
    },

    search(query: SearchSourcesQuery): SourcesSearchResult {
      const terms = normalizeSearchText(query.q ?? "")
        .split(" ")
        .filter(Boolean);
      const { pieces, total } = searchPieces(db, {
        terms,
        source: query.source,
        soloOnly: query.solo === "true",
        limit: MAX_RESULTS,
      });
      const counts = new Map(countsBySource(db).map((count) => [count.source, count]));
      const sources = LIBRARY_SOURCES.filter((source) => providers.has(source)).map(
        (source) => counts.get(source) ?? { source, pieceCount: 0, syncedAt: null },
      );
      return { pieces: pieces.map(toPiece), total, sources };
    },

    /** The MIDI file, for listening before importing (the page cannot fetch the libraries: CSP). */
    midi(id: string): Promise<Uint8Array> {
      const piece = pieceOrFail(id);
      return providerOf(piece.source).midi(piece.midiRef);
    },

    async importPiece(userId: string, id: string): Promise<ImportResult> {
      const piece = pieceOrFail(id);
      const bytes = await providerOf(piece.source).midi(piece.midiRef);
      return imports.importFromLibrary(userId, bytes, {
        library: piece.source,
        pieceId: piece.id,
        pageUrl: piece.pageUrl,
        title: piece.title,
        composer: piece.composer,
        license: piece.license,
        credit: piece.credit,
      });
    },
  };
}
