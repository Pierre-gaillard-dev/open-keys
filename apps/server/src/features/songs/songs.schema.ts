import { COVER_SOURCES } from "@open-keys/contracts";
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
    license: text("license"),
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
