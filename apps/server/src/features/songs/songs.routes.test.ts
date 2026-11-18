import {
  DEFAULT_HANDS_SETTINGS,
  type SongDetail,
  songDetailSchema,
  songSummarySchema,
} from "@open-keys/contracts";
import { encodeNoteHands, HAND_SEPARATION_VERSION, parseMidiNotes } from "@open-keys/core";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { twoHandMidi } from "../../test/fixtures";
import { createTestServer, type TestServer } from "../../test/test-server";

let server: TestServer;

afterEach(() => server?.close());

interface SongSeed {
  readonly title: string;
  readonly composer?: string;
  readonly difficulty?: number;
  readonly tags?: string[];
}

async function addSong(seed: SongSeed, index: number): Promise<SongDetail> {
  const draft = songDetailSchema.parse(
    await (await server.upload("/api/imports/file", twoHandMidi("", index), `${index}.mid`)).json(),
  );
  const confirmed = await server.json("POST", `/api/imports/${draft.id}/confirm`, {
    title: seed.title,
    composer: seed.composer ?? null,
    difficulty: seed.difficulty ?? null,
    license: null,
    tags: seed.tags ?? [],
    handMode: draft.handMode,
    splitPitch: draft.splitPitch,
    tracks: draft.tracks.map((track) => ({ id: track.id, hand: track.hand })),
  });
  server.advance(1000);
  return songDetailSchema.parse(await confirmed.json());
}

async function titles(query = ""): Promise<string[]> {
  const response = await server.request(`/api/songs${query}`);
  expect(response.status).toBe(200);
  return z
    .array(songSummarySchema)
    .parse(await response.json())
    .map((song) => song.title);
}

async function seedCatalogue() {
  server = await createTestServer();
  await server.login();
  const songs = [
    await addSong({ title: "Gymnopédie n°1", composer: "Erik Satie", difficulty: 2, tags: ["lent"] }, 0),
    await addSong({ title: "Für Elise", composer: "Beethoven", difficulty: 3, tags: ["classique"] }, 2),
    await addSong(
      { title: "Clair de lune", composer: "Debussy", difficulty: 5, tags: ["classique", "lent"] },
      4,
    ),
  ];
  // A draft never shows in the catalogue.
  await server.upload("/api/imports/file", twoHandMidi("", 6), "draft.mid");
  return songs;
}

describe("GET /api/songs", () => {
  it("lists ready songs, newest first", async () => {
    await seedCatalogue();

    expect(await titles()).toEqual(["Clair de lune", "Für Elise", "Gymnopédie n°1"]);
  });

  it("searches title and composer, case-insensitively", async () => {
    await seedCatalogue();

    expect(await titles("?q=SATIE")).toEqual(["Gymnopédie n°1"]);
    expect(await titles("?q=lune")).toEqual(["Clair de lune"]);
    expect(await titles("?q=100%25")).toEqual([]);
  });

  it("filters by tags (all required) and difficulty", async () => {
    await seedCatalogue();

    expect(await titles("?tags=classique&sort=title")).toEqual(["Clair de lune", "Für Elise"]);
    expect(await titles("?tags=classique,lent")).toEqual(["Clair de lune"]);
    expect(await titles("?difficulty=2,3&sort=title")).toEqual(["Für Elise", "Gymnopédie n°1"]);
  });

  it("filters and sorts by the personal state of the user", async () => {
    const [gymnopedie, elise] = await seedCatalogue();
    const put = (songId: string, entry: object) =>
      server.json("PUT", `/api/library/${songId}`, {
        status: "to_learn",
        isFavorite: false,
        lastPositionMs: 0,
        lastTempoPct: 100,
        handsSettings: DEFAULT_HANDS_SETTINGS,
        lastLoopId: null,
        lastPracticedAt: null,
        updatedAt: server.now(),
        ...entry,
      });
    await put(gymnopedie?.id ?? "", { status: "learning", isFavorite: true, lastPracticedAt: 1000 });
    await put(elise?.id ?? "", { status: "mastered", lastPracticedAt: 2000 });

    expect(await titles("?status=learning")).toEqual(["Gymnopédie n°1"]);
    expect(await titles("?status=to_learn")).toEqual(["Clair de lune"]);
    expect(await titles("?favorite=true")).toEqual(["Gymnopédie n°1"]);
    expect(await titles("?sort=practiced")).toEqual(["Für Elise", "Gymnopédie n°1", "Clair de lune"]);
  });

  it("rejects invalid filters", async () => {
    await seedCatalogue();

    expect((await server.request("/api/songs?difficulty=9")).status).toBe(400);
    expect((await server.request("/api/songs?sort=random")).status).toBe(400);
  });
});

describe("GET /api/songs/:id", () => {
  it("returns tracks, tags and the MIDI URL", async () => {
    const [gymnopedie] = await seedCatalogue();

    const song = songDetailSchema.parse(await (await server.request(`/api/songs/${gymnopedie?.id}`)).json());

    expect(song).toMatchObject({
      title: "Gymnopédie n°1",
      tags: ["lent"],
      midiUrl: `/api/songs/${gymnopedie?.id}/midi`,
    });
    expect(song.tracks).toHaveLength(2);
  });

  it("answers 404 for unknown ids and 400 for malformed ids", async () => {
    await seedCatalogue();

    expect((await server.request("/api/songs/01ARYZ6S41TSV4RRFFQ69G5FAV")).status).toBe(404);
    expect((await server.request("/api/songs/not-an-id")).status).toBe(400);
  });
});

describe("PATCH /api/songs/:id", () => {
  it("updates only the given fields", async () => {
    const [gymnopedie] = await seedCatalogue();

    const response = await server.json("PATCH", `/api/songs/${gymnopedie?.id}`, {
      difficulty: 1,
      tags: ["Facile"],
    });
    const song = songDetailSchema.parse(await response.json());

    expect(song).toMatchObject({ title: "Gymnopédie n°1", difficulty: 1, tags: ["facile"] });
    expect(song.updatedAt).toBeGreaterThan(gymnopedie?.updatedAt ?? 0);
  });

  it("keeps unused tags out of the tag list after purge", async () => {
    const [gymnopedie] = await seedCatalogue();
    await server.json("PATCH", `/api/songs/${gymnopedie?.id}`, { tags: [] });
    server.services.tags.purgeUnused();

    const tags = (await (await server.request("/api/tags")).json()) as { name: string; songCount: number }[];

    expect(tags).toEqual([
      { name: "classique", songCount: 2 },
      { name: "lent", songCount: 1 },
    ]);
  });
});

describe("PATCH /api/songs/:id (hands per note, D28)", () => {
  it("stores the hand of every note, checked against the song's own notes", async () => {
    const [gymnopedie] = await seedCatalogue();
    const midi = new Uint8Array(
      await (await server.request(`/api/songs/${gymnopedie?.id}/midi`)).arrayBuffer(),
    );
    const { notes } = parseMidiNotes(midi);
    const encoded = encodeNoteHands(
      notes,
      notes.map((note) => (note.pitch >= 60 ? "right" : "left")),
    );
    const noteHands = { ...encoded, source: "edited", version: HAND_SEPARATION_VERSION };

    const saved = await server.json("PATCH", `/api/songs/${gymnopedie?.id}`, { noteHands });

    expect(saved.status).toBe(200);
    expect(songDetailSchema.parse(await saved.json()).noteHands).toMatchObject(noteHands);

    const other = { ...noteHands, fingerprint: "00000000" };
    const refused = await server.json("PATCH", `/api/songs/${gymnopedie?.id}`, { noteHands: other });
    expect(refused.status).toBe(400);
    const shorter = { ...noteHands, hands: noteHands.hands.slice(1) };
    expect((await server.json("PATCH", `/api/songs/${gymnopedie?.id}`, { noteHands: shorter })).status).toBe(
      400,
    );

    const removed = await server.json("PATCH", `/api/songs/${gymnopedie?.id}`, { noteHands: null });
    expect(songDetailSchema.parse(await removed.json()).noteHands).toBeNull();
  });
});

describe("DELETE /api/songs/:id", () => {
  it("hides the song immediately", async () => {
    const [gymnopedie] = await seedCatalogue();

    const response = await server.request(`/api/songs/${gymnopedie?.id}`, { method: "DELETE" });

    expect(response.status).toBe(204);
    expect(await titles()).not.toContain("Gymnopédie n°1");
    expect((await server.request(`/api/songs/${gymnopedie?.id}`)).status).toBe(404);
  });
});

describe("GET /api/songs/:id/midi", () => {
  it("serves the original file with an immutable cache and its hash as ETag", async () => {
    server = await createTestServer();
    await server.login();
    const song = await addSong({ title: "Test" }, 0);

    const response = await server.request(song.midiUrl);
    const etag = response.headers.get("ETag") ?? "";

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("audio/midi");
    expect(response.headers.get("Cache-Control")).toContain("immutable");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(twoHandMidi("", 0));
    expect((await server.request(song.midiUrl, { headers: { "If-None-Match": etag } })).status).toBe(304);
  });
});
