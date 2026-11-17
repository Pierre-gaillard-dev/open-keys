import type { LibraryEntry, SongDetail, SongSummary } from "@open-keys/contracts";
import type { CatalogSearch } from "./catalog-search";

const collator = new Intl.Collator("fr", { sensitivity: "base" });

function withLibrary(song: SongDetail, entries: ReadonlyMap<string, LibraryEntry>): SongSummary {
  const entry = entries.get(song.id);
  return entry
    ? {
        ...song,
        library: {
          status: entry.status,
          isFavorite: entry.isFavorite,
          lastPracticedAt: entry.lastPracticedAt,
        },
      }
    : song;
}

function matches(song: SongSummary, search: CatalogSearch): boolean {
  const text = search.q?.trim().toLowerCase();
  if (text && !`${song.title} ${song.composer ?? ""}`.toLowerCase().includes(text)) {
    return false;
  }
  const tags = new Set(song.tags.map((tag) => tag.toLowerCase()));
  if (search.tags?.some((tag) => !tags.has(tag.toLowerCase()))) {
    return false;
  }
  const view = search.view ?? "all";
  if (view === "favorites") {
    return song.library?.isFavorite ?? false;
  }
  return view === "all" || (song.library?.status ?? "to_learn") === view;
}

function compare(sort: CatalogSearch["sort"]): (a: SongSummary, b: SongSummary) => number {
  switch (sort) {
    case "title":
      return (a, b) => collator.compare(a.title, b.title);
    case "practiced":
      return (a, b) =>
        (b.library?.lastPracticedAt ?? -1) - (a.library?.lastPracticedAt ?? -1) || b.createdAt - a.createdAt;
    default:
      return (a, b) => b.createdAt - a.createdAt;
  }
}

/**
 * Offline catalogue (UC-14): the songs stored on the device, with the personal state of the library
 * (possibly changed offline), filtered and sorted like GET /api/songs does on the server.
 */
export function offlineCatalog(
  songs: readonly SongDetail[],
  library: readonly LibraryEntry[],
  search: CatalogSearch,
): SongSummary[] {
  const entries = new Map(library.map((entry) => [entry.songId, entry]));
  return songs
    .filter((song) => song.state === "ready")
    .map((song) => withLibrary(song, entries))
    .filter((song) => matches(song, search))
    .sort(compare(search.sort));
}
