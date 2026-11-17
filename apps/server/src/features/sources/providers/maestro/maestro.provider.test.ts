import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseCsv, parseMaestroCsv } from "./maestro.csv";
import { createMaestroProvider, MAESTRO_CSV_URL, MAESTRO_ZIP_URL } from "./maestro.provider";

const CSV = `canonical_composer,canonical_title,split,year,midi_filename,audio_filename,duration
Frédéric Chopin,"Ballade No. 1 in G Minor, Op. 23",train,2018,2018/perf-one.midi,2018/perf-one.wav,543.2
"Johann Sebastian Bach","Prelude ""in"" C",test,2009,2009/perf-two.midi,2009/perf-two.wav,98.5
`;

let dataDir: string;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "open-keys-maestro-"));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

describe("MAESTRO metadata", () => {
  it("parses quoted CSV fields", () => {
    expect(parseCsv('a,"b, c","d ""e"""\r\n1,2,3\n')).toEqual([
      ["a", "b, c", 'd "e"'],
      ["1", "2", "3"],
    ]);
    expect(parseMaestroCsv(CSV)[0]).toEqual({
      composer: "Frédéric Chopin",
      title: "Ballade No. 1 in G Minor, Op. 23",
      year: 2018,
      midiFilename: "2018/perf-one.midi",
      duration: 543.2,
    });
  });
});

describe("MAESTRO provider", () => {
  it("downloads and extracts the archive once, then serves the files from the disk", async () => {
    const archive = zipSync({
      "maestro-v3.0.0/2018/perf-one.midi": new Uint8Array([1, 2, 3]),
      "maestro-v3.0.0/2009/perf-two.midi": new Uint8Array([4]),
      "maestro-v3.0.0/LICENSE": new Uint8Array([9]),
    });
    const requested: string[] = [];
    const provider = createMaestroProvider({
      dataDir,
      get: (url) => {
        requested.push(url);
        return Promise.resolve(new Response(url === MAESTRO_CSV_URL ? CSV : archive.slice().buffer));
      },
    });

    const pieces = await provider.list(AbortSignal.timeout(5000));
    await provider.list(AbortSignal.timeout(5000));

    expect(requested).toEqual([MAESTRO_CSV_URL, MAESTRO_ZIP_URL, MAESTRO_CSV_URL]);
    expect(pieces.map((piece) => piece.externalId)).toEqual(["perf-one", "perf-two"]);
    expect(pieces[0]).toMatchObject({
      title: "Ballade No. 1 in G Minor, Op. 23",
      composer: "Frédéric Chopin",
      solo: true,
      license: "CC BY-NC-SA 4.0",
      credit: "Interprétation au concours e-Competition 2018 (MAESTRO, Google Magenta)",
      durationMs: 543_200,
      publishedAt: Date.UTC(2018, 0, 1),
    });
    expect([...(await provider.midi("perf-one"))]).toEqual([1, 2, 3]);
    await expect(provider.midi("../secret")).rejects.toThrow();
  });
});
