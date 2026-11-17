import {
  getText,
  type ListedPiece,
  type MidiDownload,
  type PageGet,
  type SourceProvider,
  sleep,
  WEEK_MS,
} from "../source-provider.types";
import { isKeyboardSolo, type ListingPiece, parseListingPage } from "./mutopia.listing";

/** Mutopia's search page, 10 pieces per page: every piece with a piano part. */
export const LISTING_URL = "https://www.mutopiaproject.org/cgibin/make-table.cgi?Instrument=Piano";
const PIECE_PAGE_URL = "https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=";
/** Guard against a pagination loop: Mutopia has about 80 pages of piano pieces. */
const MAX_PAGES = 400;

export interface MutopiaProviderDeps {
  readonly get: PageGet;
  readonly download: MidiDownload;
  /** Pause between two listing pages (0 in tests). */
  readonly pageDelayMs?: number;
}

function toListed(piece: ListingPiece & { midiUrl: string }): ListedPiece {
  return {
    externalId: String(piece.mutopiaId),
    title: piece.title,
    composer: piece.composer,
    opus: piece.opus,
    instrument: piece.instrument,
    solo: isKeyboardSolo(piece.instrument),
    style: piece.style,
    license: piece.license,
    credit: null,
    durationMs: null,
    midiRef: piece.midiUrl,
    pageUrl: `${PIECE_PAGE_URL}${piece.mutopiaId}`,
    publishedAt: piece.publishedAt,
  };
}

/**
 * Mutopia Project (D24): no API nor index file, its RSS stops in 2019. The listing pages give every
 * field (about 80 pages, one per second). Pieces split into several MIDI files are left out.
 */
export function createMutopiaProvider(deps: MutopiaProviderDeps): SourceProvider {
  const pageDelayMs = deps.pageDelayMs ?? 1000;
  return {
    id: "mutopia",
    maxAgeMs: WEEK_MS,
    async list(signal) {
      const pieces: ListedPiece[] = [];
      let startAt: number | null = 0;
      for (let page = 0; startAt !== null; page++) {
        if (page >= MAX_PAGES) {
          throw new Error("Mutopia listing has too many pages");
        }
        if (page > 0) {
          await sleep(pageDelayMs);
        }
        const listing = parseListingPage(
          await getText(deps.get, `${LISTING_URL}&startat=${startAt}`, signal),
        );
        for (const piece of listing.pieces) {
          if (piece.midiUrl !== null) {
            pieces.push(toListed({ ...piece, midiUrl: piece.midiUrl }));
          }
        }
        startAt = listing.nextStartAt;
      }
      return pieces;
    },
    midi: (midiRef) => deps.download(midiRef),
  };
}
