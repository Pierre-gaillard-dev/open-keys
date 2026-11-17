import { z } from "zod";
import { timestampSchema, ulidSchema } from "./common.contract";

/** Online libraries indexed by the API (UC-20). */
export const LIBRARY_SOURCES = ["mutopia", "maestro", "xivmidi"] as const;
export const librarySourceSchema = z.enum(LIBRARY_SOURCES);
export type LibrarySource = z.infer<typeof librarySourceSchema>;

/** "<source>:<id in the source>", e.g. "mutopia:37", "xivmidi:34441583-df9a-…". */
export const sourcePieceIdSchema = z.string().regex(/^[a-z]+:[\w.-]+$/, "Invalid piece id");

/** A piece of an online library, with a single MIDI file. */
export const sourcePieceSchema = z.object({
  id: sourcePieceIdSchema,
  source: librarySourceSchema,
  title: z.string(),
  /** Composer, or artist for arrangements of songs. */
  composer: z.string().nullable(),
  opus: z.string().nullable(),
  /** Instrumentation as the source describes it ("Piano", "Voice and Piano", "Cello, Piano"…). */
  instrument: z.string(),
  /** Playable by one musician as is: one keyboard part (Mutopia, MAESTRO), a solo arrangement (xivmidi). */
  solo: z.boolean(),
  /** Style, genre or tags. */
  style: z.string().nullable(),
  /** Short form ("Public Domain", "CC BY-SA 4.0"), null when the source does not say. */
  license: z.string().nullable(),
  /** Who made the file (arranger, performer…), shown with the song once imported. */
  credit: z.string().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  /** Added to the source (or year of the performance). */
  publishedAt: timestampSchema.nullable(),
  /** Song of the catalogue imported from this piece, if any. */
  songId: ulidSchema.nullable(),
});

export type SourcePiece = z.infer<typeof sourcePieceSchema>;

export const searchSourcesQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  /** One library, or all of them. */
  source: librarySourceSchema.optional(),
  /** Solo pieces only (default), or everything. */
  solo: z.enum(["true", "false"]).default("true"),
});

export type SearchSourcesQuery = z.infer<typeof searchSourcesQuerySchema>;

export const sourceStatusSchema = z.object({
  source: librarySourceSchema,
  pieceCount: z.number().int().nonnegative(),
  /** Last complete synchronisation of this library, null before the first one. */
  syncedAt: timestampSchema.nullable(),
});

export type SourceStatus = z.infer<typeof sourceStatusSchema>;

export const sourcesSearchResultSchema = z.object({
  pieces: z.array(sourcePieceSchema),
  /** Matches, possibly more than the pieces returned. */
  total: z.number().int().nonnegative(),
  sources: z.array(sourceStatusSchema),
});

export type SourcesSearchResult = z.infer<typeof sourcesSearchResultSchema>;

export const sourcePieceParamSchema = z.object({ id: sourcePieceIdSchema });
