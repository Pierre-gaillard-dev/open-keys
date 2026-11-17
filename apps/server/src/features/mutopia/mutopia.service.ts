import type { MutopiaPiece, MutopiaSearchResult, SearchMutopiaQuery } from "@open-keys/contracts";
import type { Database } from "../../db";
import { AppError } from "../../shared/http";
import type { Logger } from "../../shared/logger";
import type { Clock } from "../../shared/runtime";
import type { ImportResult, ImportsService } from "../imports";
import { isKeyboardSolo, type ListingPiece, parseListingPage } from "./mutopia.listing";
import {
  deletePiecesSyncedBefore,
  type FoundPiece,
  findPiece,
  lastSyncedAt,
  normalizeSearchText,
  searchPieces,
  upsertPieces,
} from "./mutopia.queries";
import type { NewMutopiaPieceRow } from "./mutopia.schema";
import { type MutopiaSource, PAGE_DELAY_MS } from "./mutopia.source";

/** The index is synchronised again when older than this. */
export const SYNC_MAX_AGE_MS = 7 * 24 * 60 * 60_000;
/** A whole synchronisation (about 80 pages) must end within this delay. */
const SYNC_TIMEOUT_MS = 10 * 60_000;
/** Guard against a pagination loop: Mutopia has about 80 pages of piano pieces. */
const MAX_PAGES = 400;
const MAX_RESULTS = 100;

export interface MutopiaServiceDeps {
  readonly db: Database;
  readonly source: MutopiaSource;
  readonly imports: ImportsService;
  readonly clock: Clock;
  readonly logger: Logger;
  /** Pause between pages (0 in tests). */
  readonly pageDelayMs?: number;
}

export interface SyncReport {
  readonly pieces: number;
  /** Pieces split into several MIDI files: not importable as one song. */
  readonly skipped: number;
  readonly removed: number;
}

export type MutopiaService = ReturnType<typeof createMutopiaService>;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function toRow(piece: ListingPiece & { midiUrl: string }, syncedAt: number): NewMutopiaPieceRow {
  return {
    ...piece,
    keyboardSolo: isKeyboardSolo(piece.instrument),
    searchText: normalizeSearchText([piece.title, piece.composer, piece.opus ?? ""].join(" ")),
    syncedAt,
  };
}

function toPiece(row: FoundPiece): MutopiaPiece {
  return {
    id: row.mutopiaId,
    title: row.title,
    composer: row.composer,
    opus: row.opus,
    instrument: row.instrument,
    keyboardSolo: row.keyboardSolo,
    style: row.style,
    license: row.license,
    publishedAt: row.publishedAt,
    songId: row.songId,
  };
}

/** Mutopia Project (UC-20): local index synchronised weekly, searched locally, one-click import. */
export function createMutopiaService(deps: MutopiaServiceDeps) {
  const { db, source, imports, clock, logger } = deps;
  const pageDelayMs = deps.pageDelayMs ?? PAGE_DELAY_MS;
  let running: Promise<SyncReport> | null = null;

  /** Reads every listing page; nothing is written unless the whole listing was read. */
  const crawl = async (signal: AbortSignal): Promise<ListingPiece[]> => {
    const pieces: ListingPiece[] = [];
    let startAt: number | null = 0;
    for (let page = 0; startAt !== null; page++) {
      if (page >= MAX_PAGES) {
        throw new Error("Mutopia listing has too many pages");
      }
      if (page > 0) {
        await sleep(pageDelayMs);
      }
      const listing = parseListingPage(await source.listingPage(startAt, signal));
      pieces.push(...listing.pieces);
      startAt = listing.nextStartAt;
    }
    return pieces;
  };

  const runSync = async (): Promise<SyncReport> => {
    const started = clock();
    const pieces = await crawl(AbortSignal.timeout(SYNC_TIMEOUT_MS));
    if (pieces.length === 0) {
      // An empty listing is a broken page, not an empty library: keep the index.
      throw new Error("Mutopia listing is empty");
    }
    const importable = pieces.filter(
      (piece): piece is ListingPiece & { midiUrl: string } => piece.midiUrl !== null,
    );
    const removed = db.transaction((tx) => {
      upsertPieces(
        tx,
        importable.map((piece) => toRow(piece, started)),
      );
      return deletePiecesSyncedBefore(tx, started);
    });
    const report = { pieces: importable.length, skipped: pieces.length - importable.length, removed };
    logger.info("Mutopia index synchronised", { ...report, durationMs: clock() - started });
    return report;
  };

  const findOrFail = (id: number) => {
    const piece = findPiece(db, id);
    if (!piece) {
      throw new AppError("NOT_FOUND", "Piece not found in the Mutopia index");
    }
    return piece;
  };

  return {
    /** Crawls the listing again; concurrent calls share the same run. */
    sync(): Promise<SyncReport> {
      running ??= runSync().finally(() => {
        running = null;
      });
      return running;
    },

    /** Weekly job: synchronises only when the index is missing or older than a week. */
    syncIfStale(): Promise<SyncReport | null> {
      const last = lastSyncedAt(db);
      if (last !== null && clock() - last < SYNC_MAX_AGE_MS) {
        return Promise.resolve(null);
      }
      return this.sync();
    },

    search(query: SearchMutopiaQuery): MutopiaSearchResult {
      const terms = normalizeSearchText(query.q ?? "")
        .split(" ")
        .filter(Boolean);
      const { pieces, total } = searchPieces(db, {
        terms,
        keyboardSoloOnly: query.solo === "true",
        limit: MAX_RESULTS,
      });
      return { pieces: pieces.map(toPiece), total, syncedAt: lastSyncedAt(db) };
    },

    /** The MIDI file, for listening before importing (the page cannot fetch Mutopia itself: CSP). */
    midi(id: number): Promise<Uint8Array> {
      return imports.downloadMidi(findOrFail(id).midiUrl);
    },

    importPiece(userId: string, id: number): Promise<ImportResult> {
      const piece = findOrFail(id);
      return imports.importFromLibrary(userId, piece.midiUrl, {
        title: piece.title,
        composer: piece.composer,
        license: piece.license,
      });
    },
  };
}
