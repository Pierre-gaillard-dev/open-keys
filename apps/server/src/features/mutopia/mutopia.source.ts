/** Mutopia's search page, listing 10 pieces per page: every piece with a piano part. */
export const LISTING_URL = "https://www.mutopiaproject.org/cgibin/make-table.cgi?Instrument=Piano";

/** Pause between two pages: about 80 pages, gently, once a week. */
export const PAGE_DELAY_MS = 1000;

/** Access to the listing pages (HTML), injected so that tests run without network. */
export interface MutopiaSource {
  listingPage(startAt: number, signal: AbortSignal): Promise<string>;
}

export type HtmlGet = (url: string, init: { signal: AbortSignal }) => Promise<Response>;

export function createMutopiaSource(httpGet: HtmlGet): MutopiaSource {
  return {
    async listingPage(startAt, signal) {
      const response = await httpGet(`${LISTING_URL}&startat=${startAt}`, { signal });
      if (!response.ok) {
        throw new Error(`Mutopia listing answered ${response.status}`);
      }
      return response.text();
    },
  };
}
