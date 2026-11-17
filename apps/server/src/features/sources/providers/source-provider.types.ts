import type { LibrarySource } from "@open-keys/contracts";

/** A piece as a provider lists it, before it is stored in the index. */
export interface ListedPiece {
  readonly externalId: string;
  readonly title: string;
  readonly composer: string | null;
  readonly opus: string | null;
  readonly instrument: string;
  readonly solo: boolean;
  readonly style: string | null;
  readonly license: string | null;
  readonly credit: string | null;
  readonly durationMs: number | null;
  readonly midiRef: string;
  readonly pageUrl: string | null;
  readonly publishedAt: number | null;
}

/** An online library (UC-20): its whole listing, and the MIDI file of one of its pieces. */
export interface SourceProvider {
  readonly id: LibrarySource;
  /** The index is synchronised again when older than this. */
  readonly maxAgeMs: number;
  /** Every importable piece. Throws if the listing could not be read completely. */
  list(signal: AbortSignal): Promise<ListedPiece[]>;
  midi(midiRef: string): Promise<Uint8Array>;
}

/** Plain GET of a known public site, with the identifying User-Agent (injected: fake in tests). */
export type PageGet = (url: string, init: { signal: AbortSignal }) => Promise<Response>;

/** Download of a MIDI file by URL (size limit, SSRF protection). */
export type MidiDownload = (url: string) => Promise<Uint8Array>;

export const WEEK_MS = 7 * 24 * 60 * 60_000;

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Reads a page and fails on HTTP errors. */
export async function getText(get: PageGet, url: string, signal: AbortSignal): Promise<string> {
  const response = await get(url, { signal });
  if (!response.ok) {
    throw new Error(`${new URL(url).host} answered ${response.status}`);
  }
  return response.text();
}
