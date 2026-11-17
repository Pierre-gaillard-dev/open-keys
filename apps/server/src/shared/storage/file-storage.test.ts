import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createFileStorage, sha256Of } from "./file-storage";

async function storage() {
  const dir = await mkdtemp(join(tmpdir(), "open-keys-storage-"));
  return { dir, storage: await createFileStorage(dir) };
}

const bytes = new TextEncoder().encode("MThd fake midi");

describe("createFileStorage", () => {
  it("stores files under their SHA-256 and reads them back", async () => {
    const { dir, storage: files } = await storage();

    const stored = await files.put("midi", bytes);

    expect(stored).toEqual({ sha256: sha256Of(bytes), size: bytes.byteLength });
    expect(await files.read("midi", stored.sha256)).toEqual(bytes);
    expect(await readdir(join(dir, "midi"))).toEqual([`${stored.sha256}.mid`]);
  });

  it("is idempotent for identical content", async () => {
    const { storage: files } = await storage();

    await files.put("cover", bytes);
    await files.put("cover", bytes);

    expect((await files.list("cover")).map((file) => file.sha256)).toEqual([sha256Of(bytes)]);
  });

  it("removes files and ignores missing ones", async () => {
    const { storage: files } = await storage();
    const { sha256 } = await files.put("midi", bytes);

    await files.remove("midi", sha256);
    await files.remove("midi", sha256);

    expect(await files.read("midi", sha256)).toBeUndefined();
  });

  it("refuses anything that is not a SHA-256 (no path traversal)", async () => {
    const { storage: files } = await storage();

    await expect(files.read("midi", "../../etc/passwd")).rejects.toThrow("Invalid file hash");
  });
});
