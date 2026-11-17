import { describe, expect, it } from "vitest";
import type { HttpGet } from "./cover-provider.types";
import { createMusicBrainzProvider } from "./musicbrainz.provider";
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

    const candidates = await createMusicBrainzProvider(httpGet).search(
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

    await createMusicBrainzProvider(httpGet).search({ title: 'Say "hi"' }, signal);

    expect(decodeURIComponent(calls[0] ?? "")).toContain('releasegroup:"Say \\"hi\\""');
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
                  thumburl: "https://upload.wikimedia.org/thumb/a/ab/Satie.jpg/320px-Satie.jpg",
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
        thumbnailUrl: "https://upload.wikimedia.org/thumb/a/ab/Satie.jpg/320px-Satie.jpg",
        imageUrl: "https://upload.wikimedia.org/thumb/a/ab/Satie.jpg/1024px-Satie.jpg",
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
