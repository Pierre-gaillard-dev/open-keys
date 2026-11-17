export interface CoverQuery {
  readonly title: string;
  readonly composer?: string | undefined;
}

export interface CoverCandidate {
  readonly source: "musicbrainz" | "wikidata";
  /** Small image for the picker (loaded by the browser). */
  readonly thumbnailUrl: string;
  /** Image downloaded by the server when this candidate is chosen. */
  readonly imageUrl: string;
  readonly label: string;
  readonly credit: string | null;
}

export interface CoverProvider {
  readonly source: CoverCandidate["source"];
  search(query: CoverQuery, signal: AbortSignal): Promise<CoverCandidate[]>;
}

/** Subset of fetch used by providers (injected in tests). */
export type HttpGet = (
  url: string,
  init: { signal: AbortSignal; method?: "GET" | "HEAD" },
) => Promise<Response>;
