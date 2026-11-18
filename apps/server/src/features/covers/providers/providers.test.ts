import { describe, expect, it } from "vitest";
import type { HttpGet } from "./cover-provider.types";
import { createMusicBrainzProvider, searchVariants } from "./musicbrainz.provider";
import { createWikidataProvider } from "./wikidata.provider";

type Route = (url: URL, method: string) => unknown;

/** Fake HTTP: each handler returns a JSON body, `false` (404) or `true` (200 without body). */
function fakeHttp(route: Route): { httpGet: HttpGet; calls: string[] } {
  const calls: string[] = [];
  const httpGet: HttpGet = (url, init) => {
    calls.push(`${init.method ?? "GET"} ${url}`);
    const body = route(new URL(url), init.method ?? "GET");
    if (body === false || body === undefined) {
      return Promise.resolve(new Response(null, { status: 404 }));
    }
    return Promise.resolve(body === true ? new Response(null) : Response.json(body));
  };
  return { httpGet, calls };
}

const signal = new AbortController().signal;

describe("createMusicBrainzProvider", () => {
  it("returns release groups that have a front cover", async () => {
    const { httpGet, calls } = fakeHttp((url, method) => {
      if (url.hostname === "musicbrainz.org") {
        return {
          "release-groups": [
            { id: "with-art", title: "Gymnopédies", score: 100, "artist-credit": [{ name: "Erik Satie" }] },
            { id: "no-art", title: "Gymnopédies (live)", score: 90 },
            { id: "low-score", title: "Other", score: 40 },
          ],
        };
      }
      return method === "HEAD" && url.pathname.includes("with-art");
    });

    const candidates = await createMusicBrainzProvider(httpGet, 0).search(
      { title: "Gymnopédie", composer: "Satie" },
      signal,
    );

    expect(candidates).toEqual([
      {
        source: "musicbrainz",
        thumbnailUrl: "https://coverartarchive.org/release-group/with-art/front-250",
        imageUrl: "https://coverartarchive.org/release-group/with-art/front-1200",
        label: "Gymnopédies — Erik Satie",
        credit: "Cover Art Archive",
      },
    ]);
    expect(decodeURIComponent(calls[0] ?? "")).toContain('releasegroup:"Gymnopédie" AND artist:"Satie"');
    expect(calls.some((call) => call.includes("low-score"))).toBe(false);
  });

  it("escapes quotes in the query", async () => {
    const { httpGet, calls } = fakeHttp(() => ({ "release-groups": [] }));

    await createMusicBrainzProvider(httpGet, 0).search({ title: 'Say "hi"' }, signal);

    expect(decodeURIComponent(calls[0] ?? "")).toContain('releasegroup:"Say \\"hi\\""');
  });

  it("falls back to the album a recording is on, the most released official one", async () => {
    const release = (id: string, extra: object = {}) => ({
      status: "Official",
      "release-group": { id, title: id, "primary-type": "Album", ...extra },
    });
    const { httpGet, calls } = fakeHttp((url, method) => {
      if (url.pathname.endsWith("/release-group/")) {
        return { "release-groups": [] };
      }
      if (url.pathname.endsWith("/recording/")) {
        return {
          recordings: [
            {
              score: 100,
              "artist-credit": [{ name: "Linkin Park" }],
              releases: [
                release("live", { "secondary-types": ["Live"] }),
                release("meteora"),
                release("meteora"),
                release("best-of"),
                { status: "Bootleg", "release-group": { id: "bootleg", "primary-type": "Album" } },
              ],
            },
            { score: 30, releases: [release("other"), release("other"), release("other")] },
          ],
        };
      }
      return method === "HEAD";
    });

    const candidates = await createMusicBrainzProvider(httpGet, 0).search(
      { title: "Numb", composer: "Linkin Park" },
      signal,
    );

    expect(candidates.map((candidate) => candidate.label)).toEqual([
      "meteora — Linkin Park",
      "best-of — Linkin Park",
    ]);
    expect(decodeURIComponent(calls[1] ?? "")).toContain('recording:"Numb" AND artist:"Linkin Park"');
  });

  it("tries the parts of a composite title until one has a cover", async () => {
    const { httpGet, calls } = fakeHttp((url, method) => {
      const query = url.searchParams.get("query") ?? "";
      if (url.pathname.endsWith("/release-group/")) {
        return {
          "release-groups": query.startsWith('releasegroup:"Time" ')
            ? [{ id: "time", title: "Time", score: 100, "artist-credit": [{ name: "Hans Zimmer" }] }]
            : [],
        };
      }
      if (url.pathname.endsWith("/recording/")) {
        return { recordings: [] };
      }
      return method === "HEAD";
    });

    const candidates = await createMusicBrainzProvider(httpGet, 0).search(
      { title: "Time - Inception (Piano)", composer: "Hans Zimmer" },
      signal,
    );

    expect(candidates.map((candidate) => candidate.label)).toEqual(["Time — Hans Zimmer"]);
    expect(calls.filter((call) => call.includes("musicbrainz.org"))).toHaveLength(3);
  });

  it("tries again once when MusicBrainz is busy, and reports other failures", async () => {
    let searches = 0;
    const busyOnce: HttpGet = (url, init) => {
      if (url.includes("musicbrainz.org")) {
        searches++;
        return Promise.resolve(
          searches === 1
            ? new Response(null, { status: 503 })
            : Response.json({ "release-groups": [{ id: "a", title: "A", score: 100 }] }),
        );
      }
      return Promise.resolve(new Response(null, { status: init.method === "HEAD" ? 200 : 404 }));
    };
    expect(await createMusicBrainzProvider(busyOnce, 0).search({ title: "A" }, signal)).toHaveLength(1);
    expect(searches).toBe(2);

    const down: HttpGet = () => Promise.resolve(new Response(null, { status: 500 }));
    await expect(createMusicBrainzProvider(down, 0).search({ title: "A" }, signal)).rejects.toThrow(
      "MusicBrainz answered 500",
    );
  });
});

describe("searchVariants", () => {
  it("reads the artist from community file names and drops arrangement notes", () => {
    expect(searchVariants({ title: "Evanescence - Bring Me to Life [Piano arr.]" })).toEqual([
      { artist: "Evanescence", title: "Bring Me to Life" },
      { title: "Evanescence - Bring Me to Life", artist: undefined },
    ]);
    expect(searchVariants({ title: "Evanescence - Bring Me to Life", composer: "Evanescence" })).toEqual([
      { title: "Bring Me to Life", artist: "Evanescence" },
    ]);
    expect(searchVariants({ title: "Time - Inception", composer: "Hans Zimmer" })).toEqual([
      { title: "Time - Inception", artist: "Hans Zimmer" },
      { title: "Time", artist: "Hans Zimmer" },
      { title: "Inception", artist: "Hans Zimmer" },
    ]);
  });
});

describe("createWikidataProvider", () => {
  const composerEntity = {
    labels: { en: { value: "Erik Satie" } },
    claims: {
      P18: [{ mainsnak: { datavalue: { value: "Erik Satie 1920.jpg" } } }],
      P106: [{ mainsnak: { datavalue: { value: { id: "Q36834" } } } }],
    },
  };
  const homonym = { claims: { P18: [{ mainsnak: { datavalue: { value: "Street.jpg" } } }] } };

  function wikimedia(entities: Record<string, unknown>): Route {
    return (url) => {
      const action = url.searchParams.get("action");
      if (action === "wbsearchentities") {
        return { search: Object.keys(entities).map((id) => ({ id })) };
      }
      if (action === "wbgetentities") {
        return { entities };
      }
      return {
        query: {
          pages: {
            "1": {
              imageinfo: [
                {
                  thumburl: "https://thumb.wikimedia.org/thumb/a/ab/Satie.jpg/960px-Satie.jpg",
                  extmetadata: {
                    Artist: { value: '<a href="x">Unknown photographer</a>' },
                    LicenseShortName: { value: "Public domain" },
                  },
                },
              ],
            },
          },
        },
      };
    };
  }

  it("returns the portrait of the composer with its attribution", async () => {
    const { httpGet } = fakeHttp(wikimedia({ Q1: homonym, Q2: composerEntity }));

    const candidates = await createWikidataProvider(httpGet).search(
      { title: "x", composer: "Satie" },
      signal,
    );

    expect(candidates).toEqual([
      {
        source: "wikidata",
        thumbnailUrl: "https://thumb.wikimedia.org/thumb/a/ab/Satie.jpg/330px-Satie.jpg",
        imageUrl: "https://thumb.wikimedia.org/thumb/a/ab/Satie.jpg/960px-Satie.jpg",
        label: "Portrait · Erik Satie",
        credit: "Unknown photographer · Public domain · Wikimedia Commons",
      },
    ]);
  });

  it("ignores people who are not musicians, and works without composer", async () => {
    const { httpGet, calls } = fakeHttp(wikimedia({ Q1: homonym }));
    const provider = createWikidataProvider(httpGet);

    expect(await provider.search({ title: "x", composer: "Satie" }, signal)).toEqual([]);
    expect(await provider.search({ title: "x" }, signal)).toEqual([]);
    expect(calls).toHaveLength(2);
  });
});
