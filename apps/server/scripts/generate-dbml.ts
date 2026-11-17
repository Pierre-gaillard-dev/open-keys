/**
 * Regenerates docs/database.dbml from the Drizzle schema (decision D15): the documentation can never
 * drift from the code. CI regenerates it and fails when the committed file differs.
 * Usage: pnpm --filter @open-keys/server db:dbml
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sqliteGenerate } from "drizzle-dbml-generator";
import * as schema from "../src/db/schema";

const OUTPUT = fileURLToPath(new URL("../../../docs/database.dbml", import.meta.url));

const HEADER = `// Open Keys — database schema (SQLite / Drizzle)
// GENERATED from apps/server/src/db/schema.ts by \`pnpm --filter @open-keys/server db:dbml\`: do not edit by hand.
// Diagram: paste into https://dbdiagram.io — column meanings and rules: docs/04-database.md
`;

const dbml = sqliteGenerate({ schema, relational: false });
writeFileSync(OUTPUT, `${HEADER}\n${dbml.trim()}\n`);
