import type { LibraryEntry } from "@open-keys/contracts";
import { DEFAULT_HANDS_SETTINGS } from "@open-keys/contracts";
import { describe, expect, it } from "vitest";
import { songDetail } from "../../test/fixtures";
import { offlineCatalog } from "./offline-catalog";

const satie = songDetail({ title: "Gymnopédie", composer: "Erik Satie", tags: ["Classique"], createdAt: 1 });
const chopin = songDetail({ title: "Nocturne", composer: "Chopin", tags: [], createdAt: 2 });
const draft = songDetail({ title: "Draft", state: "draft", createdAt: 3 });

function entry(songId: string, patch: Partial<LibraryEntry>): LibraryEntry {
  return {
    songId,
    status: "to_learn",
    isFavorite: false,
    lastPositionMs: 0,
    lastTempoPct: 100,
    handsSettings: DEFAULT_HANDS_SETTINGS,
    lastLoopId: null,
    lastPracticedAt: null,
    updatedAt: 1,
    ...patch,
  };
}

const titles = (songs: { title: string }[]) => songs.map((song) => song.title);

describe("offlineCatalog", () => {
  it("lists the playable songs, most recent first, without drafts", () => {
    expect(titles(offlineCatalog([satie, chopin, draft], [], {}))).toEqual(["Nocturne", "Gymnopédie"]);
  });

  it("filters by text, tag and view with the library state changed offline", () => {
    const library = [entry(satie.id, { status: "learning", isFavorite: true })];

    expect(titles(offlineCatalog([satie, chopin], library, { q: "satie" }))).toEqual(["Gymnopédie"]);
    expect(titles(offlineCatalog([satie, chopin], library, { tags: ["classique"] }))).toEqual(["Gymnopédie"]);
    expect(titles(offlineCatalog([satie, chopin], library, { view: "favorites" }))).toEqual(["Gymnopédie"]);
    expect(titles(offlineCatalog([satie, chopin], library, { view: "to_learn" }))).toEqual(["Nocturne"]);
    expect(offlineCatalog([satie], library, {})[0]?.library).toMatchObject({ status: "learning" });
  });

  it("sorts by title or by last practice", () => {
    const library = [entry(satie.id, { lastPracticedAt: 10 })];

    expect(titles(offlineCatalog([chopin, satie], [], { sort: "title" }))).toEqual([
      "Gymnopédie",
      "Nocturne",
    ]);
    expect(titles(offlineCatalog([chopin, satie], library, { sort: "practiced" }))).toEqual([
      "Gymnopédie",
      "Nocturne",
    ]);
  });
});
