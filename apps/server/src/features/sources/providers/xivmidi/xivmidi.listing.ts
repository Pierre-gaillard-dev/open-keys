/**
 * Reading of the xivmidi library pages (/files?page=N): the site is a Next.js app, each page embeds
 * its 24 files as JSON in the React Server Components payload (self.__next_f.push([1, "…"])).
 */

export interface XivmidiFile {
  readonly fileId: string;
  readonly title: string;
  readonly artist: string | null;
  readonly credit: string | null;
  readonly additionalCredits: readonly string[];
  /** Number of musicians (bards) the arrangement is written for. */
  readonly bandsize: number;
  readonly instruments: readonly string[];
  /** Seconds. */
  readonly duration: number | null;
  readonly tags: readonly string[];
  readonly publishedAt: number | null;
  /** "none" unless a copyright claim is being moderated. */
  readonly claimModerationState: string;
}

const PAYLOAD_CHUNK = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;

/** The RSC payload of a page, as text (each chunk is a JSON string literal). */
function payloadOf(html: string): string {
  return [...html.matchAll(PAYLOAD_CHUNK)]
    .map(([, literal]) => JSON.parse(literal ?? '""') as string)
    .join("");
}

/** Index of the quote closing the JSON string opened at `open`. */
function endOfString(text: string, open: number): number {
  for (let i = open + 1; i < text.length; i++) {
    if (text[i] === "\\") {
      i++;
    } else if (text[i] === '"') {
      return i;
    }
  }
  return text.length;
}

/** The JSON array starting at `start` (index of "["), by bracket matching outside strings. */
function arrayAt(text: string, start: number): string | null {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      i = endOfString(text, i);
    } else if (char === "[") {
      depth++;
    } else if (char === "]") {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return null;
}

/** "$D2026-11-15T03:38:09.071Z" (serialised Date) → epoch ms. */
function dateOf(value: unknown): number | null {
  if (typeof value !== "string") {
    return null;
  }
  const time = Date.parse(value.replace(/^\$D/, ""));
  return Number.isNaN(time) ? null : time;
}

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;
const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

function toFile(raw: Record<string, unknown>): XivmidiFile | null {
  const fileId = text(raw["fileId"]);
  const title = text(raw["title"]);
  if (!(fileId && /^[\w-]+$/.test(fileId) && title)) {
    return null;
  }
  return {
    fileId,
    title,
    artist: text(raw["artist"]),
    credit: text(raw["credit"]),
    additionalCredits: strings(raw["additionalCredits"]),
    bandsize: typeof raw["bandsize"] === "number" ? raw["bandsize"] : 1,
    instruments: strings(raw["instruments"]),
    duration: typeof raw["duration"] === "number" ? raw["duration"] : null,
    tags: strings(raw["tags"]),
    publishedAt: dateOf(raw["publishedAt"]),
    claimModerationState: text(raw["claimModerationState"]) ?? "none",
  };
}

/** The files of one library page; empty after the last page. Throws if the page has no file list. */
export function parseLibraryPage(html: string): XivmidiFile[] {
  const payload = payloadOf(html);
  const start = payload.indexOf('"files":[');
  const array = start === -1 ? null : arrayAt(payload, start + '"files":'.length);
  if (array === null) {
    throw new Error("xivmidi page without a file list");
  }
  const parsed: unknown = JSON.parse(array);
  return (Array.isArray(parsed) ? parsed : [])
    .filter((raw): raw is Record<string, unknown> => typeof raw === "object" && raw !== null)
    .map(toFile)
    .filter((file): file is XivmidiFile => file !== null);
}

/** "ElectricGuitarClean" → "Electric Guitar Clean" */
export function instrumentName(name: string): string {
  return name.replace(/([a-z])([A-Z])/g, "$1 $2");
}
