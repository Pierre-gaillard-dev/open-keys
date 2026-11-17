import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it } from "vitest";
import { OfflineDb } from "./offline-db";
import { isPersistedQueryKey, persistQueryCache } from "./query-persistence";

let db: OfflineDb | undefined;

afterEach(async () => {
  await db?.delete();
});

describe("isPersistedQueryKey", () => {
  it.each([
    [["auth", "me"], true],
    [["library"], true],
    [["tags"], true],
    [["songs", "list", { view: "all" }], false],
    [["songs", "S1", "detail"], true],
    [["songs", "S1", "loops"], true],
    [["songs", "S1", "practice-stats"], true],
    [["songs", "S1", "cover-suggestions", "Title", null], false],
    [["timelines", "S1", 1], false],
    [["device", "songs"], false],
  ])("%j → %s", (key, persisted) => {
    expect(isPersistedQueryKey(key)).toBe(persisted);
  });
});

describe("persistQueryCache", () => {
  it("restores the data of the previous visit in a new client", async () => {
    db = new OfflineDb(`persist-test-${Math.random()}`);
    const first = new QueryClient();
    const stop = await persistQueryCache(first, db);
    first.setQueryData(["library"], [{ songId: "S1" }]);
    first.setQueryData(["timelines", "S1", 1], { notes: [] });
    // Saving is throttled (1 s).
    await new Promise((resolve) => setTimeout(resolve, 1100));
    stop();

    const next = new QueryClient();
    await persistQueryCache(next, db);

    expect(next.getQueryData(["library"])).toEqual([{ songId: "S1" }]);
    expect(next.getQueryData(["timelines", "S1", 1])).toBeUndefined();
  });
});
