import {
  type MutopiaSearchResult,
  mutopiaSearchResultSchema,
  type SongDetail,
  songDetailSchema,
} from "@open-keys/contracts";
import { apiBytes, apiRequest } from "../../../shared/api";

export function searchMutopia(q: string, solo: boolean, signal?: AbortSignal): Promise<MutopiaSearchResult> {
  return apiRequest("GET", "/mutopia/pieces", {
    query: { q, solo },
    schema: mutopiaSearchResultSchema,
    ...(signal ? { signal } : {}),
  });
}

/** Draft song for the review screen (UC-20), title, composer and licence pre-filled. */
export function importMutopiaPiece(id: number): Promise<SongDetail> {
  return apiRequest("POST", `/mutopia/pieces/${id}/import`, { schema: songDetailSchema });
}

/** For listening before importing (served by the API: the page cannot fetch Mutopia, CSP). */
export function fetchMutopiaMidi(id: number): Promise<Uint8Array> {
  return apiBytes(`/api/mutopia/pieces/${id}/midi`);
}
