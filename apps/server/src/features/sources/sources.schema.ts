import { LIBRARY_SOURCES } from "@open-keys/contracts";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Local copy of the online libraries' indexes (UC-20): pieces with a single MIDI file. Each library is
 * synchronised on its own schedule and searched locally (never queried while the user searches).
 */
export const sourcePieces = sqliteTable(
  "source_pieces",
  {
    /** "<source>:<externalId>" */
    id: text("id").primaryKey(),
    source: text("source", { enum: LIBRARY_SOURCES }).notNull(),
    /** Id of the piece in its library. */
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    composer: text("composer"),
    opus: text("opus"),
    instrument: text("instrument").notNull(),
    solo: integer("solo", { mode: "boolean" }).notNull(),
    style: text("style"),
    license: text("license"),
    credit: text("credit"),
    durationMs: integer("duration_ms"),
    /** Where the provider gets the MIDI file: a URL, or a path in a downloaded archive. */
    midiRef: text("midi_ref").notNull(),
    /** Public page of the piece, kept as the song's source URL. */
    pageUrl: text("page_url"),
    publishedAt: integer("published_at"),
    /** Title, composer, opus and credit, lower case without accents: "gymnopedie" finds "Gymnopédie". */
    searchText: text("search_text").notNull(),
    syncedAt: integer("synced_at").notNull(),
  },
  (table) => [index("source_pieces_source_idx").on(table.source, table.syncedAt)],
);

export type SourcePieceRow = typeof sourcePieces.$inferSelect;
export type NewSourcePieceRow = typeof sourcePieces.$inferInsert;
