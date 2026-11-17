import { type ListSongsQuery, SONG_SORTS } from "@open-keys/contracts";
import { z } from "zod";
import type { QueryParams } from "../../shared/api";

export const CATALOG_VIEWS = ["all", "favorites", "to_learn", "learning", "mastered"] as const;
export type CatalogView = (typeof CATALOG_VIEWS)[number];

export const CATALOG_VIEW_LABELS: Readonly<Record<CatalogView, string>> = {
  all: "Tous",
  favorites: "Favoris",
  to_learn: "À apprendre",
  learning: "En cours",
  mastered: "Maîtrisés",
};

/** Catalogue state kept in the URL (shareable, survives reloads). Invalid values fall back to defaults. */
export const catalogSearchSchema = z.object({
  q: z.string().optional().catch(undefined),
  view: z.enum(CATALOG_VIEWS).optional().catch(undefined),
  tags: z.array(z.string()).optional().catch(undefined),
  sort: z.enum(SONG_SORTS).optional().catch(undefined),
});

export type CatalogSearch = z.infer<typeof catalogSearchSchema>;

/** URL state → query parameters of GET /api/songs. */
export function toSongsQuery(search: CatalogSearch): QueryParams {
  const view = search.view ?? "all";
  const status: ListSongsQuery["status"] = view === "all" || view === "favorites" ? undefined : view;
  return {
    q: search.q?.trim() || undefined,
    tags: search.tags,
    status,
    favorite: view === "favorites" ? "true" : undefined,
    sort: search.sort,
  };
}
