import { songDetailSchema } from "@open-keys/contracts";
import { afterEach, describe, expect, it } from "vitest";
import { pngImage, twoHandMidi } from "../../test/fixtures";
import { createTestServer, type TestServer } from "../../test/test-server";
import { DELETED_SONG_RETENTION_MS, DRAFT_RETENTION_MS, ORPHAN_FILE_GRACE_MS } from "./maintenance.service";

let server: TestServer;

afterEach(() => server?.close());

async function importSong(seed: number, confirm: boolean) {
  const draft = songDetailSchema.parse(
    await (await server.upload("/api/imports/file", twoHandMidi("", seed), `${seed}.mid`)).json(),
  );
  if (confirm) {
    await server.json("POST", `/api/imports/${draft.id}/confirm`, {
      title: `Song ${seed}`,
      composer: null,
      difficulty: null,
      license: null,
      tags: ["temp"],
      handMode: draft.handMode,
      splitPitch: draft.splitPitch,
      tracks: [],
    });
  }
  return draft.id;
}

describe("maintenance", () => {
  it("drops drafts abandoned for more than 24 h, keeps recent ones", async () => {
    server = await createTestServer();
    await server.login();
    const old = await importSong(0, false);
    server.advance(DRAFT_RETENTION_MS + 1);
    const recent = await importSong(2, false);

    const report = await server.services.maintenance.run();

    expect(report.drafts).toBe(1);
    expect((await server.request(`/api/songs/${old}`)).status).toBe(404);
    expect((await server.request(`/api/songs/${recent}`)).status).toBe(200);
  });

  it("purges deleted songs after 30 days, with their unused tags", async () => {
    server = await createTestServer();
    await server.login();
    const id = await importSong(0, true);
    await server.request(`/api/songs/${id}`, { method: "DELETE" });

    expect((await server.services.maintenance.run()).deletedSongs).toBe(0);
    server.advance(DELETED_SONG_RETENTION_MS + 1);
    const report = await server.services.maintenance.run();

    expect(report).toMatchObject({ deletedSongs: 1, tags: 1 });
    // Fully gone: re-importing creates a new song.
    expect((await server.upload("/api/imports/file", twoHandMidi("", 0), "again.mid")).status).toBe(201);
  });

  it("removes orphan files after a grace period, never referenced ones", async () => {
    server = await createTestServer();
    await server.login();
    const id = await importSong(0, true);
    await server.uploadWith("PUT", `/api/songs/${id}/cover`, await pngImage(), "c.png");
    const orphan = await server.storage.put("midi", twoHandMidi("", 9));

    expect((await server.services.maintenance.run()).files).toBe(0);
    // File timestamps are real: move the clock past the grace period instead of waiting.
    server.advance(ORPHAN_FILE_GRACE_MS + 60_000);
    const report = await server.services.maintenance.run();

    expect(report.files).toBe(1);
    expect(await server.storage.read("midi", orphan.sha256)).toBeUndefined();
    expect((await server.request(`/api/songs/${id}/midi`)).status).toBe(200);
    expect((await server.request(`/api/songs/${id}/cover`)).status).toBe(200);
  });
});
