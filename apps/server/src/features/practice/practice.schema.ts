import { PRACTICE_MODES } from "@open-keys/contracts";
import { sql } from "drizzle-orm";
import { check, index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "../auth/auth.schema";
import { songs } from "../songs/songs.schema";

export const loops = sqliteTable(
  "loops",
  {
    /** ULID generated on the client (offline creation). */
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    songId: text("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    name: text("name"),
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms").notNull(),
    targetTempoPct: integer("target_tempo_pct"),
    bestTempoPct: integer("best_tempo_pct"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    deletedAt: integer("deleted_at"),
  },
  (table) => [
    index("loops_user_song_idx").on(table.userId, table.songId, table.deletedAt),
    check("loops_range_check", sql`${table.endMs} > ${table.startMs}`),
  ],
);

export const practiceSessions = sqliteTable(
  "practice_sessions",
  {
    /** ULID generated on the client: PUT is idempotent. */
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    songId: text("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    loopId: text("loop_id").references(() => loops.id, { onDelete: "set null" }),
    mode: text("mode", { enum: PRACTICE_MODES }).notNull().default("watch"),
    startedAt: integer("started_at").notNull(),
    endedAt: integer("ended_at").notNull(),
    activeMs: integer("active_ms").notNull(),
    minTempoPct: integer("min_tempo_pct").notNull(),
    maxTempoPct: integer("max_tempo_pct").notNull(),
    accuracy: real("accuracy"),
    score: integer("score"),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("practice_sessions_user_song_idx").on(table.userId, table.songId, table.startedAt),
    index("practice_sessions_user_started_idx").on(table.userId, table.startedAt),
    check("practice_sessions_mode_check", sql`${table.mode} in ('watch', 'wait', 'rhythm')`),
  ],
);
