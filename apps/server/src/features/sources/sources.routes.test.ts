import { readFileSync } from "node:fs";
import { songDetailSchema, sourcesSearchResultSchema } from "@open-keys/contracts";
import { afterEach, describe, expect, it } from "vitest";
import { twoHandMidi } from "../../test/fixtures";
import { createTestServer, type TestServer } from "../../test/test-server";
import type { ListedPiece, SourceProvider } from "./providers/source-provider.types";

/** Real Mutopia page (3 pieces, "Next 10"): vocal, Gymnopédie, Bach in several MIDI files. */
const MUTOPIA_PAGE = readFileSync(
  new URL("../../test/mutopia-listing.fixture.html", import.meta.url),
  "utf8",
);
const GYMNOPEDIE_MIDI = "https://www.mutopiaproject.org/ftp/SatieE/gymnopedie_1/gymnopedie_1.mid";

/** A last Mutopia page (no "Next" link) with one piece, in Mutopia's markup. */
function lastMutopiaPage(piece = { id: 900, title: "Nocturne", midi: "chopin/nocturne.mid" }) {
  return `<table class="table-bordered result-table">
<tr><td>${piece.title}</td><td>by F. Chopin (1810–1849)</td><td>Opus 9, No. 2</td><td>&nbsp;</td></tr>
<tr><td>for Piano</td><td>1832</td><td>Romantic</td><td></td></tr>
<tr><td>Source</td><td><a href="../legal.html#ccbysa4">Creative Commons Attribution-ShareAlike 4.0</a></td>
<td><a href="piece-info.cgi?id=${piece.id}">More Information</a></td><td>2020/01/02</td></tr>
<tr><td><a href="https://www.mutopiaproject.org/ftp/${piece.midi}">.mid file</a></td></tr>
</table>`;
}

function listed(overrides: Partial<ListedPiece> & { externalId: string; title: string }): ListedPiece {
  return {
    composer: null,
    opus: null,
    instrument: "Piano",
    solo: true,
    style: null,
    license: null,
    credit: null,
    durationMs: null,
    midiRef: overrides.externalId,
    pageUrl: null,
    publishedAt: null,
    ...overrides,
  };
}

/** A library served from memory: `pieces` is read at each synchronisation. */
function memoryProvider(id: SourceProvider["id"], pieces: ListedPiece[], maxAgeMs = 1000): SourceProvider {
  return {
    id,
    maxAgeMs,
    list: () => (pieces.length === 0 ? Promise.reject(new Error("down")) : Promise.resolve([...pieces])),
    midi: () => Promise.resolve(twoHandMidi(id)),
  };
}

let server: TestServer;

afterEach(() => server?.close());

async function search(query = "") {
  const response = await server.request(`/api/sources/pieces${query}`);
  expect(response.status).toBe(200);
  return sourcesSearchResultSchema.parse(await response.json());
}

const titles = (result: { pieces: { title: string }[] }) => result.pieces.map((piece) => piece.title);

describe("online libraries (UC-20)", () => {
  it("require a session", async () => {
    server = await createTestServer();
    expect((await server.request("/api/sources/pieces")).status).toBe(401);
  });

  it("are empty and never synchronised at first", async () => {
    server = await createTestServer();
    await server.login();

    expect(await search()).toEqual({
      pieces: [],
      total: 0,
      sources: [{ source: "mutopia", pieceCount: 0, syncedAt: null }],
    });
  });

  describe("Mutopia", () => {
    async function mutopiaServer(pages: string[] = [MUTOPIA_PAGE, lastMutopiaPage()]) {
      server = await createTestServer({
        mutopiaPages: pages,
        remoteFiles: { [GYMNOPEDIE_MIDI]: twoHandMidi("Gymnopédie") },
      });
      await server.login();
      await server.services.sources.sync("mutopia");
    }

    it("indexes every listing page, without the pieces split into several MIDI files", async () => {
      await mutopiaServer();

      const all = await search("?solo=false");
      expect(titles(all)).toEqual(["Gymnopédie No. 1", "Nocturne", "Vocalise № 1"]);
      expect(all.sources).toEqual([{ source: "mutopia", pieceCount: 3, syncedAt: server.now() }]);
      expect(all.pieces[1]).toMatchObject({
        id: "mutopia:900",
        composer: "F. Chopin",
        license: "CC BY-SA 4.0",
      });
    });

    it("imports a piece with its metadata for the review, then shows it as already in the catalogue", async () => {
      await mutopiaServer();

      const imported = await server.request("/api/sources/pieces/mutopia:37/import", { method: "POST" });
      expect(imported.status).toBe(201);
      const draft = songDetailSchema.parse(await imported.json());
      expect(draft).toMatchObject({
        state: "draft",
        title: "Gymnopédie No. 1",
        composer: "E. Satie",
        license: "Public Domain",
        sourceType: "url",
        sourceLibrary: "mutopia",
        sourceUrl: "https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=37",
      });

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

    it("removes the pieces gone from the library, and keeps the index when the listing cannot be read", async () => {
      const pages = [MUTOPIA_PAGE, lastMutopiaPage()];
      await mutopiaServer(pages);

      pages.splice(0, pages.length, lastMutopiaPage({ id: 901, title: "Valse", midi: "c/valse.mid" }));
      server.advance(1000);
      expect(await server.services.sources.sync("mutopia")).toEqual({
        source: "mutopia",
        pieces: 1,
        removed: 3,
      });
      expect(titles(await search("?solo=false"))).toEqual(["Valse"]);

      // The second page is missing: nothing is written.
      pages.splice(0, pages.length, MUTOPIA_PAGE);
      await expect(server.services.sources.sync("mutopia")).rejects.toThrow();
      expect(titles(await search("?solo=false"))).toEqual(["Valse"]);
    });
  });

  describe("several libraries", () => {
    async function librariesServer(xivmidi: ListedPiece[]) {
      const maestro = [
        listed({
          externalId: "perf-1",
          title: "Ballade No. 1",
          composer: "Frédéric Chopin",
          credit: "Interprétation 2018",
        }),
      ];
      server = await createTestServer({
        sourceProviders: () => [
          memoryProvider("maestro", maestro, 10_000),
          memoryProvider("xivmidi", xivmidi),
        ],
      });
      await server.login();
      await server.services.sources.syncStale();
    }

    it("search across libraries, or in one, with the solo filter", async () => {
      await librariesServer([
        listed({
          externalId: "a",
          title: "Bad Apple",
          credit: "Bard A",
          solo: false,
          instrument: "Harp, Lute",
        }),
        listed({ externalId: "b", title: "Ballad of the Wind", composer: "Composer B" }),
      ]);

      expect(titles(await search("?q=ball"))).toEqual(["Ballad of the Wind", "Ballade No. 1"]);
      expect(titles(await search("?q=BAD-APPLE!&solo=false"))).toEqual(["Bad Apple"]);
      expect(titles(await search("?q=ball&source=maestro"))).toEqual(["Ballade No. 1"]);
      expect(titles(await search("?q=bard&solo=false"))).toEqual(["Bad Apple"]);
      expect((await search()).sources.map((status) => [status.source, status.pieceCount])).toEqual([
        ["maestro", 1],
        ["xivmidi", 2],
      ]);
    });

    it("keep the other libraries when one is down, and resynchronise only the stale ones", async () => {
      const xivmidi: ListedPiece[] = [];
      await librariesServer(xivmidi);
      expect((await search()).sources).toEqual([
        { source: "maestro", pieceCount: 1, syncedAt: server.now() },
        { source: "xivmidi", pieceCount: 0, syncedAt: null },
      ]);

      xivmidi.push(listed({ externalId: "c", title: "Song" }));
      server.advance(5000);
      expect((await server.services.sources.syncStale()).map((report) => report.source)).toEqual(["xivmidi"]);
    });

    it("import with the library's credit, and serve the MIDI to listen", async () => {
      await librariesServer([
        listed({ externalId: "b", title: "Ballad", credit: "Bard B", pageUrl: "https://x/b" }),
      ]);

      const midi = await server.request("/api/sources/pieces/xivmidi:b/midi");
      expect(midi.headers.get("content-type")).toBe("audio/midi");
      expect(new Uint8Array(await midi.arrayBuffer())).toEqual(twoHandMidi("xivmidi"));
      const draft = songDetailSchema.parse(
        await (await server.request("/api/sources/pieces/xivmidi:b/import", { method: "POST" })).json(),
      );
      expect(draft).toMatchObject({ credit: "Bard B", sourceLibrary: "xivmidi", sourceUrl: "https://x/b" });
      expect((await server.request("/api/sources/pieces/xivmidi:zzz/midi")).status).toBe(404);
      expect((await server.request("/api/sources/pieces/not%20an%20id/midi")).status).toBe(400);
    });
  });
});
