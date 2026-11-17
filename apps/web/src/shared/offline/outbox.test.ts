import { onlineManager } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiError, type FakeReply, installFakeApi, NETWORK_ERROR } from "../../test/fake-api";
import { OfflineDb } from "./offline-db";
import { Outbox } from "./outbox";

let db: OfflineDb;
let reply: FakeReply;

beforeEach(() => {
  db = new OfflineDb(`outbox-test-${Math.random()}`);
  reply = { json: {} };
});

afterEach(async () => {
  await db.delete();
  vi.unstubAllGlobals();
});

function fakeServer() {
  return installFakeApi({ "PUT /api/*": () => reply });
}

const bodies = (api: ReturnType<typeof fakeServer>) => api.requests.map((r) => [r.path, r.body]);

describe("Outbox", () => {
  it("sends the queued writes in order and empties the queue", async () => {
    const api = fakeServer();
    const onSynced = vi.fn();
    const outbox = new Outbox(db, { onSynced });

    await outbox.put("/library/A", { n: 1 });
    await outbox.put("/loops/B", { n: 2 });
    await outbox.flush();

    expect(bodies(api)).toEqual([
      ["/api/library/A", { n: 1 }],
      ["/api/loops/B", { n: 2 }],
    ]);
    expect(await db.outbox.count()).toBe(0);
    expect(outbox.state.getState().pending).toBe(0);
    expect(onSynced).toHaveBeenCalled();
  });

  it("keeps only the latest write per path while offline, and sends it when back online", async () => {
    const api = fakeServer();
    const outbox = new Outbox(db);
    onlineManager.setOnline(false);

    await outbox.put("/library/A", { n: 1 });
    await outbox.put("/library/A", { n: 2 });
    await outbox.flush();
    expect(api.requests).toHaveLength(0);
    expect(outbox.state.getState().pending).toBe(1);

    onlineManager.setOnline(true);
    await outbox.flush();
    expect(bodies(api)).toEqual([["/api/library/A", { n: 2 }]]);
  });

  it("stops at a network failure and goes offline, keeping the write for later", async () => {
    const api = fakeServer();
    const outbox = new Outbox(db);
    reply = NETWORK_ERROR;

    await outbox.put("/library/A", { n: 1 });
    await outbox.put("/library/B", { n: 2 });
    await outbox.flush();

    expect(api.requests).toHaveLength(1);
    expect(onlineManager.isOnline()).toBe(false);
    const [first] = await db.outbox.orderBy("createdAt").toArray();
    expect(first).toMatchObject({ path: "/library/A", attempts: 1 });
    expect(await db.outbox.count()).toBe(2);
  });

  it("retries server errors later, drops writes the server rejects", async () => {
    fakeServer();
    const outbox = new Outbox(db);

    reply = apiError(503, "INTERNAL_ERROR", "Unavailable");
    await outbox.put("/library/A", { n: 1 });
    await outbox.flush();
    expect(await db.outbox.count()).toBe(1);

    reply = apiError(400, "VALIDATION_ERROR", "Invalid");
    await outbox.flush();
    expect(await db.outbox.count()).toBe(0);
  });

  it("keeps the writes and reports an expired session", async () => {
    fakeServer();
    const onUnauthorized = vi.fn();
    const outbox = new Outbox(db, { onUnauthorized });
    reply = apiError(401, "UNAUTHORIZED", "Authentication required");

    await outbox.put("/library/A", { n: 1 });
    await outbox.flush();

    expect(onUnauthorized).toHaveBeenCalled();
    expect(await db.outbox.count()).toBe(1);
  });

  it("flushes again when asked during a flush that stopped early (network back meanwhile)", async () => {
    const api = fakeServer();
    const outbox = new Outbox(db);
    onlineManager.setOnline(false);
    await outbox.put("/library/A", { n: 1 });

    const running = outbox.flush();
    onlineManager.setOnline(true);
    await outbox.flush();
    await running;

    expect(api.requests).toHaveLength(1);
    expect(await db.outbox.count()).toBe(0);
  });

  it("also sends a write queued while a flush is running", async () => {
    const api = fakeServer();
    const outbox = new Outbox(db);

    const first = outbox.put("/library/A", { n: 1 });
    const second = outbox.put("/library/B", { n: 2 });
    await Promise.all([first, second]);
    await outbox.flush();

    expect(api.requests.map((r) => r.path).sort()).toEqual(["/api/library/A", "/api/library/B"]);
    expect(await db.outbox.count()).toBe(0);
  });
});
