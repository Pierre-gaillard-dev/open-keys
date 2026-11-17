import { type SQL, type SQLWrapper, sql } from "drizzle-orm";

/** Escapes LIKE wildcards, used with `escape '\'`. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** `expression` contains `term` (no wildcard from the user). */
export function containsText(expression: SQLWrapper, term: string): SQL {
  return sql`${expression} like ${`%${escapeLike(term)}%`} escape '\\'`;
}
