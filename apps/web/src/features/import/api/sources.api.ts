import {
  type LibrarySource,
  type SongDetail,
  type SourcesSearchResult,
  songDetailSchema,
  sourcesSearchResultSchema,
} from "@open-keys/contracts";
import { apiBytes, apiRequest } from "../../../shared/api";

export interface SourcesSearch {
  readonly q: string;
  /** One library, or all of them. */
  readonly source: LibrarySource | undefined;
  readonly solo: boolean;
}

export function searchSources(search: SourcesSearch, signal?: AbortSignal): Promise<SourcesSearchResult> {
  return apiRequest("GET", "/sources/pieces", {
    query: { q: search.q, source: search.source, solo: search.solo },
    schema: sourcesSearchResultSchema,
    ...(signal ? { signal } : {}),
  });
}

/** Draft song for the review screen (UC-20), with what the library knows pre-filled. */
export function importSourcePiece(id: string): Promise<SongDetail> {
  return apiRequest("POST", `/sources/pieces/${encodeURIComponent(id)}/import`, { schema: songDetailSchema });
}

/** For listening before importing (served by the API: the page cannot fetch the libraries, CSP). */
export function fetchSourceMidi(id: string): Promise<Uint8Array> {
  return apiBytes(`/api/sources/pieces/${encodeURIComponent(id)}/midi`);
}
