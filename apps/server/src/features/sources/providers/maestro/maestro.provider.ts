import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { unzipSync } from "fflate";
import { getText, type ListedPiece, type PageGet, type SourceProvider } from "../source-provider.types";
import { type MaestroRow, parseMaestroCsv } from "./maestro.csv";

const VERSION = "v3.0.0";
const BASE_URL = `https://storage.googleapis.com/magentadata/datasets/maestro/${VERSION}`;
export const MAESTRO_CSV_URL = `${BASE_URL}/maestro-${VERSION}.csv`;
export const MAESTRO_ZIP_URL = `${BASE_URL}/maestro-${VERSION}-midi.zip`;
const PAGE_URL = "https://magenta.tensorflow.org/datasets/maestro";
const LICENSE = "CC BY-NC-SA 4.0";
/** A fixed dataset version: its metadata is only checked again monthly. */
const MAX_AGE_MS = 30 * 24 * 60 * 60_000;
const COMPLETE_MARKER = ".complete";
/** "MIDI-Unprocessed_03_R2_2008_01-03_ORIG_MID--AUDIO_03_R2_2008_wav--2" */
const SAFE_NAME = /^[\w.-]+$/;

export interface MaestroProviderDeps {
  readonly get: PageGet;
  /** The archive is extracted under <dataDir>/sources/maestro-v3.0.0 (about 90 MB, once). */
  readonly dataDir: string;
}

function fileId(row: MaestroRow): string {
  return basename(row.midiFilename).replace(/\.midi?$/i, "");
}

function toListed(row: MaestroRow): ListedPiece {
  const id = fileId(row);
  return {
    externalId: id,
    title: row.title,
    composer: row.composer || null,
    opus: null,
    instrument: "Piano",
    solo: true,
    style: null,
    license: LICENSE,
    credit: `Interprétation au concours e-Competition ${row.year} (MAESTRO, Google Magenta)`,
    durationMs: Number.isFinite(row.duration) ? Math.round(row.duration * 1000) : null,
    midiRef: id,
    pageUrl: PAGE_URL,
    publishedAt: Number.isFinite(row.year) ? Date.UTC(row.year, 0, 1) : null,
  };
}

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  );

/**
 * MAESTRO (Google Magenta, CC BY-NC-SA 4.0): about 1,300 performances of pianists of the Yamaha
 * e-Competition, recorded on a MIDI grand piano. One CSV for the metadata, one archive (58 MB) for the
 * files: downloaded and extracted once on the server, then served from the disk.
 */
export function createMaestroProvider(deps: MaestroProviderDeps): SourceProvider {
  const directory = join(deps.dataDir, "sources", `maestro-${VERSION}`);

  const extractArchive = async (signal: AbortSignal) => {
    if (await exists(join(directory, COMPLETE_MARKER))) {
      return;
    }
    const response = await deps.get(MAESTRO_ZIP_URL, { signal });
    if (!response.ok) {
      throw new Error(`MAESTRO archive answered ${response.status}`);
    }
    const files = unzipSync(new Uint8Array(await response.arrayBuffer()), {
      filter: (file) => /\.midi?$/i.test(file.name),
    });
    // Extracted aside, then moved in place: a half-written directory is never used.
    const partial = `${directory}.partial`;
    await rm(partial, { recursive: true, force: true });
    await mkdir(partial, { recursive: true });
    for (const [name, bytes] of Object.entries(files)) {
      const id = basename(name).replace(/\.midi?$/i, "");
      if (SAFE_NAME.test(id)) {
        await writeFile(join(partial, `${id}.midi`), bytes);
      }
    }
    await writeFile(join(partial, COMPLETE_MARKER), "");
    await rm(directory, { recursive: true, force: true });
    await rename(partial, directory);
  };

  return {
    id: "maestro",
    maxAgeMs: MAX_AGE_MS,
    async list(signal) {
      const rows = parseMaestroCsv(await getText(deps.get, MAESTRO_CSV_URL, signal));
      await extractArchive(signal);
      const pieces: ListedPiece[] = [];
      for (const row of rows) {
        const id = fileId(row);
        if (row.title && SAFE_NAME.test(id) && (await exists(join(directory, `${id}.midi`)))) {
          pieces.push(toListed(row));
        }
      }
      return pieces;
    },
    midi(midiRef) {
      if (!SAFE_NAME.test(midiRef)) {
        return Promise.reject(new Error("Invalid MAESTRO file id"));
      }
      return readFile(join(directory, `${midiRef}.midi`)).then((buffer) => new Uint8Array(buffer));
    },
  };
}
