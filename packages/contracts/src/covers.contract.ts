import { z } from "zod";

export const COVER_SOURCES = ["upload", "url", "musicbrainz", "wikidata"] as const;

export const coverSourceSchema = z.enum(COVER_SOURCES);

export type CoverSource = z.infer<typeof coverSourceSchema>;

export const coverSchema = z.object({
  /** API path of the WebP image, versioned by its hash (cacheable forever). */
  url: z.string(),
  source: coverSourceSchema,
  /** Attribution to display (required for Wikimedia images). */
  credit: z.string().nullable(),
});

export type Cover = z.infer<typeof coverSchema>;

export const coverSuggestionsQuerySchema = z.object({
  title: z.string().trim().min(1).max(200),
  composer: z.string().trim().max(200).optional(),
});

export const coverSuggestionSchema = z.object({
  /** Opaque id, valid for one hour, to pass back when choosing this cover. */
  id: z.string(),
  source: z.enum(["musicbrainz", "wikidata"]),
  thumbnailUrl: z.url(),
  label: z.string(),
  credit: z.string().nullable(),
});

export type CoverSuggestion = z.infer<typeof coverSuggestionSchema>;

export const setCoverRequestSchema = z.union([
  z.object({ url: z.url({ protocol: /^https?$/ }) }),
  z.object({ suggestionId: z.string().min(1) }),
]);

export type SetCoverRequest = z.infer<typeof setCoverRequestSchema>;
