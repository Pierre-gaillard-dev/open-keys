import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Local copy of the Mutopia Project index, piano pieces with a single MIDI file (UC-20). Rebuilt by a
 * weekly synchronisation; searched locally (Mutopia is never queried while the user searches).
 */
export const mutopiaPieces = sqliteTable(
  "mutopia_pieces",
  {
    /** Mutopia's own id. */
    mutopiaId: integer("mutopia_id").primaryKey(),
    title: text("title").notNull(),
    composer: text("composer").notNull(),
    opus: text("opus"),
    instrument: text("instrument").notNull(),
    keyboardSolo: integer("keyboard_solo", { mode: "boolean" }).notNull(),
    style: text("style"),
    license: text("license").notNull(),
    midiUrl: text("midi_url").notNull(),
    publishedAt: integer("published_at"),
    /** Title, composer and opus, lower case without accents: "gymnopedie" finds "Gymnopédie". */
    searchText: text("search_text").notNull(),
    syncedAt: integer("synced_at").notNull(),
  },
  (table) => [index("mutopia_pieces_midi_url_idx").on(table.midiUrl)],
);

export type MutopiaPieceRow = typeof mutopiaPieces.$inferSelect;
export type NewMutopiaPieceRow = typeof mutopiaPieces.$inferInsert;
