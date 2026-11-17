import { and, asc, count, eq, isNull, lt, max, type SQL } from "drizzle-orm";
import { containsText, type Database, type Executor } from "../../db";
import { songs } from "../songs/songs.schema";
import { type MutopiaPieceRow, mutopiaPieces, type NewMutopiaPieceRow } from "./mutopia.schema";

/** Lower case, accents removed: what `search_text` holds and what a search term is compared to. */
export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function upsertPieces(db: Executor, rows: readonly NewMutopiaPieceRow[]): void {
  for (const row of rows) {
    const { mutopiaId: _id, ...fields } = row;
    db.insert(mutopiaPieces)
      .values(row)
      .onConflictDoUpdate({ target: mutopiaPieces.mutopiaId, set: fields })
      .run();
  }
}

/** Pieces that the last complete synchronisation did not see any more (removed from Mutopia). */
export function deletePiecesSyncedBefore(db: Executor, syncedAt: number): number {
  return db.delete(mutopiaPieces).where(lt(mutopiaPieces.syncedAt, syncedAt)).run().changes;
}

export function lastSyncedAt(db: Database): number | null {
  return (
    db
      .select({ value: max(mutopiaPieces.syncedAt) })
      .from(mutopiaPieces)
      .get()?.value ?? null
  );
}

export function findPiece(db: Database, mutopiaId: number): MutopiaPieceRow | undefined {
  return db.select().from(mutopiaPieces).where(eq(mutopiaPieces.mutopiaId, mutopiaId)).get();
}

export interface PieceSearch {
  /** Normalised terms, all required. */
  readonly terms: readonly string[];
  readonly keyboardSoloOnly: boolean;
  readonly limit: number;
}

export interface FoundPiece extends MutopiaPieceRow {
  /** Song of the catalogue imported from this piece (same MIDI URL), if any. */
  readonly songId: string | null;
}

function searchFilters(search: PieceSearch): SQL | undefined {
  return and(
    ...search.terms.map((term) => containsText(mutopiaPieces.searchText, term)),
    ...(search.keyboardSoloOnly ? [eq(mutopiaPieces.keyboardSolo, true)] : []),
  );
}

export function searchPieces(db: Database, search: PieceSearch): { pieces: FoundPiece[]; total: number } {
  const where = searchFilters(search);
  const total = db.select({ value: count() }).from(mutopiaPieces).where(where).get()?.value ?? 0;
  const pieces = db
    .select({ piece: mutopiaPieces, songId: songs.id })
    .from(mutopiaPieces)
    .leftJoin(
      songs,
      and(eq(songs.sourceUrl, mutopiaPieces.midiUrl), isNull(songs.deletedAt), eq(songs.state, "ready")),
    )
    .where(where)
    // By title: Mutopia writes composers with initials first ("E. Satie"), useless for sorting.
    .orderBy(asc(mutopiaPieces.searchText))
    .limit(search.limit)
    .all();
  return { pieces: pieces.map(({ piece, songId }) => ({ ...piece, songId })), total };
}
