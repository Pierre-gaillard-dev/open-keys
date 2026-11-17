import { fileURLToPath } from "node:url";
import BetterSqlite3 from "better-sqlite3";
import { type BetterSQLite3Database, drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

export type Database = BetterSQLite3Database<typeof schema>;

/** A transaction, as passed to db.transaction((tx) => …). */
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** What query functions accept: the database or a running transaction. */
export type Executor = Database | Transaction;

export interface DatabaseHandle {
  readonly db: Database;
  close(): void;
}

/** Migrations sit next to this module in dev (src/db) and next to the bundle in production (dist). */
const MIGRATIONS_FOLDER = fileURLToPath(new URL("./migrations", import.meta.url));

/** Opens (or creates) the SQLite database, applies pragmas and pending migrations. */
export function openDatabase(filename: string, migrationsFolder = MIGRATIONS_FOLDER): DatabaseHandle {
  const sqlite = new BetterSqlite3(filename);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("synchronous = NORMAL");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder });
  return { db, close: () => sqlite.close() };
}
