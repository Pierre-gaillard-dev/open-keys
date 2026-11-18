import { INVITATION_KINDS } from "@open-keys/contracts";
import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "../auth/auth.schema";

/**
 * Single-use links made by the admin (D29): a new account, or a new password for an existing one.
 * Only the hash of the token is stored, like the sessions.
 */
export const invitations = sqliteTable(
  "invitations",
  {
    id: text("id").primaryKey(),
    tokenHash: text("token_hash").notNull().unique(),
    kind: text("kind", { enum: INVITATION_KINDS }).notNull(),
    /** Account whose password is reset (`reset` only). */
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: integer("created_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
    usedAt: integer("used_at"),
  },
  (table) => [
    index("invitations_expires_at_idx").on(table.expiresAt),
    check("invitations_kind_check", sql`${table.kind} in ('account', 'reset')`),
  ],
);
