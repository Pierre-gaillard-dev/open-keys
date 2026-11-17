import {
  getText,
  type ListedPiece,
  type MidiDownload,
  type PageGet,
  type SourceProvider,
  sleep,
  WEEK_MS,
} from "../source-provider.types";
import { instrumentName, parseLibraryPage, type XivmidiFile } from "./xivmidi.listing";

const SITE = "https://xivmidi.com";
/** Guard against a pagination loop: about 290 pages of 24 files in 2026. */
const MAX_PAGES = 2000;

export interface XivmidiProviderDeps {
  readonly get: PageGet;
  readonly download: MidiDownload;
  /** Pause between two pages (0 in tests). */
  readonly pageDelayMs?: number;
}

function toListed(file: XivmidiFile): ListedPiece {
  const credits = [file.credit, ...file.additionalCredits].filter((name): name is string => Boolean(name));
  return {
    externalId: file.fileId,
    title: file.title,
    composer: file.artist,
    opus: null,
    instrument: file.instruments.map(instrumentName).join(", ") || "Inconnu",
    solo: file.bandsize === 1,
    style: file.tags.join(", ") || null,
    license: null,
    credit: credits.length > 0 ? [...new Set(credits)].join(", ") : null,
    durationMs: file.duration === null ? null : Math.round(file.duration * 1000),
    midiRef: `${SITE}/downloads/files/${file.fileId}`,
    pageUrl: `${SITE}/files/${file.fileId}`,
    publishedAt: file.publishedAt,
  };
}

/**
 * xivmidi.com: community arrangements for the bards of Final Fantasy XIV (pop, rock, games, anime…).
 * Written for instruments of 3 octaves (C3–C6), one instrument per musician. Its robots.txt allows
 * the library; every page is read, one per second, until an empty one.
 */
export function createXivmidiProvider(deps: XivmidiProviderDeps): SourceProvider {
  const pageDelayMs = deps.pageDelayMs ?? 1000;
  return {
    id: "xivmidi",
    maxAgeMs: WEEK_MS,
    async list(signal) {
      const pieces = new Map<string, ListedPiece>();
      for (let page = 1; page <= MAX_PAGES; page++) {
        if (page > 1) {
          await sleep(pageDelayMs);
        }
        const files = parseLibraryPage(await getText(deps.get, `${SITE}/files?page=${page}`, signal));
        if (files.length === 0) {
          return [...pieces.values()];
        }
        // A file under a copyright claim is left out until the site settles it.
        for (const file of files.filter((listed) => listed.claimModerationState === "none")) {
          pieces.set(file.fileId, toListed(file));
        }
      }
      throw new Error("xivmidi library has too many pages");
    },
    midi: (midiRef) => deps.download(midiRef),
  };
}
