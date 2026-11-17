import { index, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { songs } from "../songs/songs.schema";

export const tags = sqliteTable("tags", {
  id: text("id").primaryKey(),
  /** Lower case, trimmed. */
  name: text("name").notNull().unique(),
});

export const songTags = sqliteTable(
  "song_tags",
  {
    songId: text("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.songId, table.tagId] }),
    index("song_tags_tag_id_idx").on(table.tagId),
  ],
);
