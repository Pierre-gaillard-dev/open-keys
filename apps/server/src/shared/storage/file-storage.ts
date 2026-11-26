import { createHash, randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type FileKind = "midi" | "cover" | "audio";

const LAYOUT: Readonly<Record<FileKind, { readonly dir: string; readonly ext: string }>> = {
  midi: { dir: "midi", ext: ".mid" },
  cover: { dir: "covers", ext: ".webp" },
  /** Recordings waiting to be transcribed (D34): removed once done. Any format: ffmpeg reads the content. */
  audio: { dir: "audio", ext: ".audio" },
};

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export interface StoredFile {
  readonly sha256: string;
  readonly size: number;
}

export interface ListedFile {
  readonly sha256: string;
  readonly modifiedAt: number;
}

/** Content-addressed storage: files are named after their SHA-256, never after user input. */
export interface FileStorage {
  put(kind: FileKind, bytes: Uint8Array): Promise<StoredFile>;
  read(kind: FileKind, sha256: string): Promise<Uint8Array | undefined>;
  remove(kind: FileKind, sha256: string): Promise<void>;
  list(kind: FileKind): Promise<ListedFile[]>;
}

export function sha256Of(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertSha256(sha256: string): void {
  if (!SHA256_PATTERN.test(sha256)) {
    throw new Error(`Invalid file hash: ${sha256}`);
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function createFileStorage(dataDir: string): Promise<FileStorage> {
  for (const { dir } of Object.values(LAYOUT)) {
    await mkdir(join(dataDir, dir), { recursive: true });
  }
  const pathOf = (kind: FileKind, sha256: string) => {
    assertSha256(sha256);
    return join(dataDir, LAYOUT[kind].dir, `${sha256}${LAYOUT[kind].ext}`);
  };

  return {
    async put(kind, bytes) {
      const sha256 = sha256Of(bytes);
      const target = pathOf(kind, sha256);
      if (!(await exists(target))) {
        // Write then rename: a crash never leaves a truncated file under its final name.
        const temporary = `${target}.${randomBytes(6).toString("hex")}.tmp`;
        await writeFile(temporary, bytes);
        await rename(temporary, target);
      }
      return { sha256, size: bytes.byteLength };
    },
    async read(kind, sha256) {
      const path = pathOf(kind, sha256);
      try {
        return new Uint8Array(await readFile(path));
      } catch {
        return undefined;
      }
    },
    async remove(kind, sha256) {
      await rm(pathOf(kind, sha256), { force: true });
    },
    async list(kind) {
      const { dir, ext } = LAYOUT[kind];
      const hashes = (await readdir(join(dataDir, dir)))
        .filter((name) => name.endsWith(ext))
        .map((name) => name.slice(0, -ext.length))
        .filter((name) => SHA256_PATTERN.test(name));
      return Promise.all(
        hashes.map(async (sha256) => ({ sha256, modifiedAt: (await stat(pathOf(kind, sha256))).mtimeMs })),
      );
    },
  };
}
