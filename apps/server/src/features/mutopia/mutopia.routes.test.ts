import { readFileSync } from "node:fs";
import { mutopiaSearchResultSchema, songDetailSchema } from "@open-keys/contracts";
import { afterEach, describe, expect, it } from "vitest";
import { twoHandMidi } from "../../test/fixtures";
import { createTestServer, type TestServer } from "../../test/test-server";
import { SYNC_MAX_AGE_MS } from "./mutopia.service";

/** Real first page (3 pieces, with a "Next 10" link): vocal, Gymnopédie, Bach in several MIDI files. */
const FIRST_PAGE = readFileSync(new URL("../../test/mutopia-listing.fixture.html", import.meta.url), "utf8");
const GYMNOPEDIE_MIDI = "https://www.mutopiaproject.org/ftp/SatieE/gymnopedie_1/gymnopedie_1.mid";

/** A last page (no "Next" link) with one piece, in Mutopia's markup. */
function lastPage(
  piece = { id: 900, title: "Nocturne", composer: "F. Chopin", midi: "chopin/nocturne.mid" },
) {
  return `<table class="table-bordered result-table">
<tr><td>${piece.title}</td><td>by ${piece.composer} (1810–1849)</td><td>Opus 9, No. 2</td><td>&nbsp;</td></tr>
<tr><td>for Piano</td><td>1832</td><td>Romantic</td><td></td></tr>
<tr><td>Source</td><td><a href="../legal.html#ccbysa4">Creative Commons Attribution-ShareAlike 4.0</a></td>
<td><a href="piece-info.cgi?id=${piece.id}">More Information</a></td><td>2020/01/02</td></tr>
<tr><td><a href="https://www.mutopiaproject.org/ftp/${piece.midi}">.mid file</a></td></tr>
</table>`;
}

let server: TestServer;

afterEach(() => server?.close());

async function search(query = "") {
  const response = await server.request(`/api/mutopia/pieces${query}`);
  expect(response.status).toBe(200);
  return mutopiaSearchResultSchema.parse(await response.json());
}

/** The fake Mutopia reads `pages` at each request: a test can change them between synchronisations. */
async function syncedServer(pages: string[] = [FIRST_PAGE, lastPage()]) {
  server = await createTestServer({
    mutopiaPages: pages,
    remoteFiles: { [GYMNOPEDIE_MIDI]: twoHandMidi("Gymnopédie") },
  });
  await server.login();
  await server.services.mutopia.sync();
  return server;
}

describe("Mutopia index (UC-20)", () => {
  it("requires a session", async () => {
    server = await createTestServer();
    expect((await server.request("/api/mutopia/pieces")).status).toBe(401);
  });

  it("is empty and never synchronised at first", async () => {
    server = await createTestServer();
    await server.login();

    expect(await search()).toEqual({ pieces: [], total: 0, syncedAt: null });
  });

  it("indexes every page, without the pieces split into several MIDI files", async () => {
    await syncedServer();

    const all = await search("?solo=false");
    expect(all.pieces.map((piece) => piece.title)).toEqual(["Gymnopédie No. 1", "Nocturne", "Vocalise № 1"]);
    expect(all.syncedAt).toBe(server.now());
    expect(all.pieces[1]).toMatchObject({
      composer: "F. Chopin",
      opus: "Opus 9, No. 2",
      license: "CC BY-SA 4.0",
    });
  });

  it("searches without accents nor case, and keeps keyboard solos by default", async () => {
    await syncedServer();

    expect((await search("?q=GYMNOPEDIE satie")).pieces.map((piece) => piece.id)).toEqual([37]);
    expect((await search("?q=abt")).total).toBe(0);
    expect((await search("?q=abt&solo=false")).total).toBe(1);
    expect((await search("?q=100%25")).total).toBe(0);
  });

  it("imports a piece with its metadata for the review, then shows it as already in the catalogue", async () => {
    await syncedServer();

    const imported = await server.request("/api/mutopia/pieces/37/import", { method: "POST" });
    expect(imported.status).toBe(201);
    const draft = songDetailSchema.parse(await imported.json());
    expect(draft).toMatchObject({
      state: "draft",
      title: "Gymnopédie No. 1",
      composer: "E. Satie",
      license: "Public Domain",
      sourceType: "mutopia",
      sourceUrl: GYMNOPEDIE_MIDI,
    });
    expect((await search("?q=gymnopedie")).pieces[0]?.songId).toBeNull();

    await server.json("POST", `/api/imports/${draft.id}/confirm`, {
      title: draft.title,
      composer: draft.composer,
      difficulty: null,
      license: draft.license,
      tags: [],
      handMode: draft.handMode,
      splitPitch: draft.splitPitch,
      tracks: draft.tracks.map((track) => ({ id: track.id, hand: track.hand })),
    });
    expect((await search("?q=gymnopedie")).pieces[0]?.songId).toBe(draft.id);
  });

  it("serves the MIDI to listen before importing", async () => {
    await syncedServer();

    const response = await server.request("/api/mutopia/pieces/37/midi");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/midi");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(twoHandMidi("Gymnopédie"));
    expect((await server.request("/api/mutopia/pieces/999/midi")).status).toBe(404);
  });

  it("removes the pieces gone from Mutopia, and keeps the index when the listing cannot be read", async () => {
    const pages = [FIRST_PAGE, lastPage()];
    await syncedServer(pages);

    // Mutopia now has a single page with another piece.
    pages.splice(
      0,
      pages.length,
      lastPage({ id: 901, title: "Valse", composer: "F. Chopin", midi: "c/valse.mid" }),
    );
    server.advance(1000);
    expect(await server.services.mutopia.sync()).toEqual({ pieces: 1, skipped: 0, removed: 3 });
    expect((await search("?solo=false")).pieces.map((piece) => piece.title)).toEqual(["Valse"]);

    // The second page is missing: nothing is written.
    pages.splice(0, pages.length, FIRST_PAGE);
    await expect(server.services.mutopia.sync()).rejects.toThrow();
    expect((await search("?solo=false")).pieces.map((piece) => piece.title)).toEqual(["Valse"]);
  });

  it("synchronises again only when the index is a week old", async () => {
    await syncedServer();

    expect(await server.services.mutopia.syncIfStale()).toBeNull();
    server.advance(SYNC_MAX_AGE_MS);
    expect(await server.services.mutopia.syncIfStale()).toMatchObject({ pieces: 3, skipped: 1, removed: 0 });
  });
});
