import type { HandsSettings } from "@open-keys/contracts";
import { sql } from "drizzle-orm";
import { check, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "../auth/auth.schema";
import { loops } from "../practice/practice.schema";
import { songs } from "../songs/songs.schema";

export const userSongs = sqliteTable(
  "user_songs",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    songId: text("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["to_learn", "learning", "mastered"] })
      .notNull()
      .default("to_learn"),
    isFavorite: integer("is_favorite", { mode: "boolean" }).notNull().default(false),
    lastPositionMs: integer("last_position_ms").notNull().default(0),
    lastTempoPct: integer("last_tempo_pct").notNull().default(100),
    handsSettings: text("hands_settings", { mode: "json" }).$type<HandsSettings>().notNull(),
    lastLoopId: text("last_loop_id").references(() => loops.id, { onDelete: "set null" }),
    lastPracticedAt: integer("last_practiced_at"),
    /** Arbiter of last-write-wins synchronisation. */
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.songId] }),
    check("user_songs_status_check", sql`${table.status} in ('to_learn', 'learning', 'mastered')`),
  ],
);
