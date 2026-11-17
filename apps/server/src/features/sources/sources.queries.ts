import type { LibrarySource } from "@open-keys/contracts";
import { and, asc, count, eq, isNull, lt, max, type SQL } from "drizzle-orm";
import { containsText, type Database, type Executor } from "../../db";
import { songs } from "../songs/songs.schema";
import { type NewSourcePieceRow, type SourcePieceRow, sourcePieces } from "./sources.schema";

/**
 * Lower case, without accents nor punctuation: what `search_text` holds (and sorts on) and what a
 * search term is compared to. "Touhou - \"Bad Apple!!\"" → "touhou bad apple".
 */
export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function upsertPieces(db: Executor, rows: readonly NewSourcePieceRow[]): void {
  for (const row of rows) {
    const { id: _id, ...fields } = row;
    db.insert(sourcePieces).values(row).onConflictDoUpdate({ target: sourcePieces.id, set: fields }).run();
  }
}

/** Pieces of `source` that its last complete synchronisation did not see any more. */
export function deletePiecesSyncedBefore(db: Executor, source: LibrarySource, syncedAt: number): number {
  return db
    .delete(sourcePieces)
    .where(and(eq(sourcePieces.source, source), lt(sourcePieces.syncedAt, syncedAt)))
    .run().changes;
}

export interface SourceCount {
  readonly source: LibrarySource;
  readonly pieceCount: number;
  readonly syncedAt: number | null;
}

export function countsBySource(db: Database): SourceCount[] {
  return db
    .select({ source: sourcePieces.source, pieceCount: count(), syncedAt: max(sourcePieces.syncedAt) })
    .from(sourcePieces)
    .groupBy(sourcePieces.source)
    .all();
}

export function findPiece(db: Database, id: string): SourcePieceRow | undefined {
  return db.select().from(sourcePieces).where(eq(sourcePieces.id, id)).get();
}

export interface PieceSearch {
  /** Normalised terms, all required. */
  readonly terms: readonly string[];
  readonly source: LibrarySource | undefined;
  readonly soloOnly: boolean;
  readonly limit: number;
}

export interface FoundPiece extends SourcePieceRow {
  /** Song of the catalogue imported from this piece, if any. */
  readonly songId: string | null;
}

function searchFilters(search: PieceSearch): SQL | undefined {
  return and(
    ...search.terms.map((term) => containsText(sourcePieces.searchText, term)),
    ...(search.source ? [eq(sourcePieces.source, search.source)] : []),
    ...(search.soloOnly ? [eq(sourcePieces.solo, true)] : []),
  );
}

export function searchPieces(db: Database, search: PieceSearch): { pieces: FoundPiece[]; total: number } {
  const where = searchFilters(search);
  const total = db.select({ value: count() }).from(sourcePieces).where(where).get()?.value ?? 0;
  const pieces = db
    .select({ piece: sourcePieces, songId: songs.id })
    .from(sourcePieces)
    .leftJoin(
      songs,
      and(eq(songs.sourcePieceId, sourcePieces.id), isNull(songs.deletedAt), eq(songs.state, "ready")),
    )
    .where(where)
    // By title: composers are written differently by each library ("E. Satie", "Erik Satie").
    .orderBy(asc(sourcePieces.searchText))
    .limit(search.limit)
    .all();
  return { pieces: pieces.map(({ piece, songId }) => ({ ...piece, songId })), total };
}
