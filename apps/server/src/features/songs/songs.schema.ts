import { COVER_SOURCES, LIBRARY_SOURCES, NOTE_HANDS_SOURCES } from "@open-keys/contracts";
import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { users } from "../auth/auth.schema";

export const songs = sqliteTable(
  "songs",
  {
    id: text("id").primaryKey(),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    state: text("state", { enum: ["draft", "ready"] })
      .notNull()
      .default("draft"),
    title: text("title").notNull(),
    composer: text("composer"),
    difficulty: integer("difficulty"),
    sourceType: text("source_type", { enum: ["upload", "url", "mutopia"] }).notNull(),
    sourceUrl: text("source_url"),
    /** Online library (UC-20): no CHECK constraint, adding one would mean rebuilding the table. */
    sourceLibrary: text("source_library", { enum: LIBRARY_SOURCES }),
    /** Id of the piece in the sources index (source_pieces.id), to show it as already imported. */
    sourcePieceId: text("source_piece_id"),
    license: text("license"),
    /** Who made the file (arranger, performer…), as the library credits it. */
    credit: text("credit"),
    /** Deduplication key and file name: /data/midi/<sha256>.mid */
    midiSha256: text("midi_sha256").notNull().unique(),
    midiSize: integer("midi_size").notNull(),
    durationMs: integer("duration_ms").notNull(),
    noteCount: integer("note_count").notNull(),
    minPitch: integer("min_pitch").notNull(),
    maxPitch: integer("max_pitch").notNull(),
    handMode: text("hand_mode", { enum: ["tracks", "split"] })
      .notNull()
      .default("tracks"),
    splitPitch: integer("split_pitch").notNull().default(60),
    /**
     * The original recording, to play along with it (D35): a URL of an allowed audio source
     * (AUDIO_SOURCES, the app that fetches the recordings), or a file sent and kept in /data/audio.
     */
    audioUrl: text("audio_url"),
    audioSha256: text("audio_sha256"),
    /** /data/covers/<sha256>.webp, null = generated cover on the client. */
    coverSha256: text("cover_sha256"),
    coverSource: text("cover_source", { enum: COVER_SOURCES }),
    coverCredit: text("cover_credit"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    deletedAt: integer("deleted_at"),
  },
  (table) => [
    index("songs_state_deleted_at_idx").on(table.state, table.deletedAt),
    index("songs_title_idx").on(table.title),
    index("songs_composer_idx").on(table.composer),
    index("songs_source_piece_id_idx").on(table.sourcePieceId),
    check("songs_state_check", sql`${table.state} in ('draft', 'ready')`),
    check("songs_source_type_check", sql`${table.sourceType} in ('upload', 'url', 'mutopia')`),
    check("songs_hand_mode_check", sql`${table.handMode} in ('tracks', 'split')`),
    check("songs_difficulty_check", sql`${table.difficulty} is null or ${table.difficulty} between 1 and 5`),
    check(
      "songs_cover_source_check",
      sql`${table.coverSource} is null or ${table.coverSource} in ('upload', 'url', 'musicbrainz', 'wikidata')`,
    ),
  ],
);

export const songTracks = sqliteTable(
  "song_tracks",
  {
    id: text("id").primaryKey(),
    songId: text("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    trackIndex: integer("track_index").notNull(),
    channel: integer("channel").notNull(),
    name: text("name"),
    instrument: text("instrument"),
    noteCount: integer("note_count").notNull(),
    minPitch: integer("min_pitch").notNull(),
    maxPitch: integer("max_pitch").notNull(),
    hand: text("hand", { enum: ["left", "right", "ignore"] }).notNull(),
  },
  (table) => [
    uniqueIndex("song_tracks_song_track_idx").on(table.songId, table.trackIndex),
    check("song_tracks_hand_check", sql`${table.hand} in ('left', 'right', 'ignore')`),
  ],
);

/**
 * Hand of every note of a song (D28), one row per song: always read and written as a whole, kept out
 * of `songs` so the catalogue queries stay light. No row: the hands come from `hand_mode`.
 */
export const songHands = sqliteTable(
  "song_hands",
  {
    songId: text("song_id")
      .primaryKey()
      .references(() => songs.id, { onDelete: "cascade" }),
    /** One character per note in canonical order (core `encodeNoteHands`): l, r or - (not played). */
    hands: text("hands").notNull(),
    /** Fingerprint of the notes the list was made for: never applied to other notes. */
    fingerprint: text("fingerprint").notNull(),
    source: text("source", { enum: NOTE_HANDS_SOURCES }).notNull(),
    /** Version of the algorithm that computed it. */
    version: integer("version").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [check("song_hands_source_check", sql`${table.source} in ('auto', 'edited')`)],
);
