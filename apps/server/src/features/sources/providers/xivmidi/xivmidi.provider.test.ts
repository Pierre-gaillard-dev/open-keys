import { describe, expect, it } from "vitest";
import { instrumentName, parseLibraryPage } from "./xivmidi.listing";
import { createXivmidiProvider } from "./xivmidi.provider";

/** A library page as xivmidi serves it: files inside the RSC payload, split in string chunks. */
function libraryPage(files: Record<string, unknown>[]): string {
  const payload = `0:["$","div",null,{"children":["$","$L18",null,{"files":${JSON.stringify(files)}}]}]`;
  const half = Math.floor(payload.length / 2);
  return [payload.slice(0, half), payload.slice(half)]
    .map((chunk) => `<script>self.__next_f.push([1,${JSON.stringify(chunk)}])</script>`)
    .join("\n");
}

function file(fileId: string, overrides: Record<string, unknown> = {}) {
  return {
    fileId,
    title: `Song ${fileId}`,
    artist: "Artist",
    credit: "Bard",
    additionalCredits: ["Helper"],
    bandsize: 1,
    instruments: ["Piano"],
    duration: 125.5,
    tags: ["pop", "anime"],
    publishedAt: "$D2026-11-15T03:38:09.071Z",
    claimModerationState: "none",
    ...overrides,
  };
}

describe("parseLibraryPage", () => {
  it("reads the files of the payload, with quotes and brackets in strings", () => {
    const files = parseLibraryPage(libraryPage([file("a1", { title: 'He said "[hi]"' })]));

    expect(files).toEqual([
      {
        fileId: "a1",
        title: 'He said "[hi]"',
        artist: "Artist",
        credit: "Bard",
        additionalCredits: ["Helper"],
        bandsize: 1,
        instruments: ["Piano"],
        duration: 125.5,
        tags: ["pop", "anime"],
        publishedAt: Date.UTC(2026, 10, 15, 3, 38, 9, 71),
        claimModerationState: "none",
      },
    ]);
  });

  it("is empty after the last page, and fails on a page without a file list", () => {
    expect(parseLibraryPage(libraryPage([]))).toEqual([]);
    expect(() => parseLibraryPage("<html>maintenance</html>")).toThrow();
  });

  it("names instruments", () => {
    expect(instrumentName("ElectricGuitarClean")).toBe("Electric Guitar Clean");
  });
});

describe("xivmidi provider", () => {
  it("reads every page until an empty one, without files under a copyright claim", async () => {
    const pages = [
      libraryPage([
        file("a1"),
        file("a2", { bandsize: 4, instruments: ["Cello", "Piano"], claimModerationState: "pending" }),
      ]),
      libraryPage([file("b1", { bandsize: 4, instruments: ["Cello", "Piano"] })]),
      libraryPage([]),
    ];
    const requested: string[] = [];
    const provider = createXivmidiProvider({
      get: (url) => {
        requested.push(url);
        const page = pages[Number(new URL(url).searchParams.get("page")) - 1];
        return Promise.resolve(new Response(page ?? "", { status: page ? 200 : 404 }));
      },
      download: () => Promise.reject(new Error("unused")),
      pageDelayMs: 0,
    });

    const pieces = await provider.list(AbortSignal.timeout(1000));

    expect(requested).toHaveLength(3);
    expect(pieces.map((piece) => [piece.externalId, piece.solo, piece.instrument])).toEqual([
      ["a1", true, "Piano"],
      ["b1", false, "Cello, Piano"],
    ]);
    expect(pieces[0]).toMatchObject({
      composer: "Artist",
      credit: "Bard, Helper",
      style: "pop, anime",
      durationMs: 125_500,
      license: null,
      midiRef: "https://xivmidi.com/downloads/files/a1",
      pageUrl: "https://xivmidi.com/files/a1",
    });
  });
});
