import { z } from "zod";
import { timestampSchema, ulidSchema } from "./common.contract";

/** A piece of the Mutopia Project index (UC-20), with its single MIDI file. */
export const mutopiaPieceSchema = z.object({
  /** Mutopia's own id (piece-info.cgi?id=…). */
  id: z.number().int().positive(),
  title: z.string(),
  /** As Mutopia writes it: initials and name ("E. Satie"). */
  composer: z.string(),
  opus: z.string().nullable(),
  /** Instrumentation as listed by Mutopia ("Piano", "Voice and Piano"…). */
  instrument: z.string(),
  /** Only keyboard instruments (piano, harpsichord, clavichord): playable as is. */
  keyboardSolo: z.boolean(),
  style: z.string().nullable(),
  /** Short form ("Public Domain", "CC BY-SA 4.0"). */
  license: z.string(),
  /** Added to Mutopia. */
  publishedAt: timestampSchema.nullable(),
  /** Song of the catalogue imported from this piece, if any. */
  songId: ulidSchema.nullable(),
});

export type MutopiaPiece = z.infer<typeof mutopiaPieceSchema>;

export const searchMutopiaQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  /** Keyboard-only pieces (default) or every piece with a piano. */
  solo: z.enum(["true", "false"]).default("true"),
});

export type SearchMutopiaQuery = z.infer<typeof searchMutopiaQuerySchema>;

export const mutopiaSearchResultSchema = z.object({
  pieces: z.array(mutopiaPieceSchema),
  /** Matches, possibly more than the pieces returned. */
  total: z.number().int().nonnegative(),
  /** Last complete synchronisation of the index, null before the first one. */
  syncedAt: timestampSchema.nullable(),
});

export type MutopiaSearchResult = z.infer<typeof mutopiaSearchResultSchema>;

export const mutopiaPieceParamSchema = z.object({ id: z.coerce.number().int().positive() });
