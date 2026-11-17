import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFakeApi, NETWORK_ERROR } from "../../test/fake-api";
import { songDetail } from "../../test/fixtures";
import { MidiCache } from "./midi-cache";
import { OfflineDb } from "./offline-db";

let db: OfflineDb;

beforeEach(() => {
  db = new OfflineDb(`midi-test-${Math.random()}`);
});

afterEach(async () => {
  await db.delete();
  vi.unstubAllGlobals();
});

describe("MidiCache", () => {
  it("downloads a MIDI once, then serves it from the device, even offline", async () => {
    const song = songDetail();
    let online = true;
    const api = installFakeApi({
      [`GET ${song.midiUrl}`]: () => (online ? { bytes: new Uint8Array([1, 2, 3]) } : NETWORK_ERROR),
    });
    const cache = new MidiCache(db);

    // Compared as arrays: IndexedDB (fake-indexeddb) clones into another realm's Uint8Array.
    expect([...(await cache.get(song))]).toEqual([1, 2, 3]);
    online = false;
    expect([...(await cache.get(song))]).toEqual([1, 2, 3]);
    expect(api.requests).toHaveLength(1);
    expect(await cache.has(song.id)).toBe(true);
  });

  it("keeps the latest version of the song for the offline catalogue", async () => {
    const song = songDetail({ updatedAt: 1 });
    installFakeApi({ [`GET ${song.midiUrl}`]: () => ({ bytes: new Uint8Array([1]) }) });
    const cache = new MidiCache(db);

    await cache.get(song);
    await cache.get({ ...song, title: "Renamed", updatedAt: 2 });
    await cache.get({ ...song, title: "Older", updatedAt: 1 });

    expect((await cache.songs()).map((stored) => stored.title)).toEqual(["Renamed"]);
  });

  it("fails without network when the file was never stored", async () => {
    const song = songDetail();
    installFakeApi({ [`GET ${song.midiUrl}`]: () => NETWORK_ERROR });

    await expect(new MidiCache(db).get(song)).rejects.toMatchObject({ status: 0 });
    expect(await new MidiCache(db).has(song.id)).toBe(false);
  });
});
