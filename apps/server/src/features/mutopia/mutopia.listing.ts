/**
 * Reading of the Mutopia "music listing" pages (cgibin/make-table.cgi): the site has no index file nor
 * API, and its RSS feed only lists the latest additions. Each piece is a small table:
 *
 *   title             | by composer (dates)   | opus     | …
 *   for instruments   | date of composition   | style    | …
 *   source            | <a>license</a>        | <a href="piece-info.cgi?id=N">  | YYYY/MM/DD
 *   <a …ly> | <a …mid or …-mids.zip> | …
 */

export interface ListingPiece {
  readonly mutopiaId: number;
  readonly title: string;
  readonly composer: string;
  readonly opus: string | null;
  readonly instrument: string;
  readonly style: string | null;
  readonly license: string;
  /** Null when the piece has several MIDI files (zip): not importable as one song. */
  readonly midiUrl: string | null;
  readonly publishedAt: number | null;
}

export interface ListingPage {
  readonly pieces: ListingPiece[];
  /** `startat` of the next page, null on the last one. */
  readonly nextStartAt: number | null;
}

const PIECE_TABLE = /<table class="table-bordered result-table">([\s\S]*?)<\/table>/g;
const ROW = /<tr>([\s\S]*?)<\/tr>/g;
const CELL = /<td>([\s\S]*?)<\/td>/g;
const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code.startsWith("#x") || code.startsWith("#X")) {
      return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
    }
    if (code.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? entity;
  });
}

/** Cell content as plain text (links and tags removed), null when empty. */
function text(cell: string | undefined): string | null {
  const value = decodeEntities((cell ?? "").replace(/<[^>]*>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
  return value === "" ? null : value;
}

function cellsOf(table: string): string[][] {
  return [...table.matchAll(ROW)].map(([, row]) =>
    [...(row ?? "").matchAll(CELL)].map(([, cell]) => cell ?? ""),
  );
}

/** "by E. Satie (1866–1925)" → "E. Satie" */
function composerOf(cell: string | null): string | null {
  return cell?.replace(/^by\s+/i, "").replace(/\s*\([^)]*\)\s*$/, "") ?? null;
}

/** "2019/07/24" → epoch ms (UTC). */
function dateOf(cell: string | null): number | null {
  const match = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(cell ?? "");
  return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
}

function parsePiece(table: string): ListingPiece | null {
  const [first = [], second = [], third = []] = cellsOf(table);
  const id = /piece-info\.cgi\?id=(\d+)/.exec(table)?.[1];
  const title = text(first[0]);
  const composer = composerOf(text(first[1]));
  const instrument = text(second[0])?.replace(/^for\s+/i, "") ?? null;
  const license = text(third[1]);
  if (!(id && title && composer && instrument && license)) {
    return null;
  }
  return {
    mutopiaId: Number(id),
    title,
    composer,
    opus: text(first[2]),
    instrument,
    style: text(second[2]),
    license: shortLicense(license),
    midiUrl: /href="(https?:\/\/[^"]+\.mid)"/.exec(table)?.[1] ?? null,
    publishedAt: dateOf(text(third[3])),
  };
}

/** One listing page: its pieces (unreadable blocks are skipped) and the next page. */
export function parseListingPage(html: string): ListingPage {
  const pieces = [...html.matchAll(PIECE_TABLE)]
    .map(([, table]) => parsePiece(table ?? ""))
    .filter((piece): piece is ListingPiece => piece !== null);
  const next = /href="make-table\.cgi\?startat=(\d+)[^"]*">Next/.exec(html)?.[1];
  return { pieces, nextStartAt: next === undefined ? null : Number(next) };
}

/** "Creative Commons Attribution-ShareAlike 4.0" → "CC BY-SA 4.0" (the form used on licence badges). */
export function shortLicense(license: string): string {
  const match = /^Creative Commons Attribution(-ShareAlike)?(-NonCommercial)?\s+([\d.]+)$/i.exec(license);
  if (!match) {
    return license;
  }
  return `CC BY${match[2] ? "-NC" : ""}${match[1] ? "-SA" : ""} ${match[3]}`;
}

const KEYBOARDS: ReadonlySet<string> = new Set(["piano", "harpsichord", "clavichord", "fortepiano"]);

/** "Piano", "Harpsichord, Piano": playable as is. "Voice and Piano", "Piano Duet": not. */
export function isKeyboardSolo(instrument: string): boolean {
  return instrument
    .toLowerCase()
    .split(/\s*,\s*|\s+and\s+/)
    .every((part) => KEYBOARDS.has(part.trim()));
}
