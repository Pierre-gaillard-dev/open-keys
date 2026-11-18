import { USER_ROLES } from "@open-keys/contracts";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  /** Checked by the application: a CHECK constraint added later would mean rebuilding the table (D29). */
  role: text("role", { enum: USER_ROLES }).notNull().default("member"),
  /** A disabled account can no longer log in; its data stays (its imports remain in the catalogue). */
  disabledAt: integer("disabled_at"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const authSessions = sqliteTable(
  "auth_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** SHA-256 of the cookie token: the token itself is never stored. */
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: integer("expires_at").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("auth_sessions_user_id_idx").on(table.userId),
    index("auth_sessions_expires_at_idx").on(table.expiresAt),
  ],
);
