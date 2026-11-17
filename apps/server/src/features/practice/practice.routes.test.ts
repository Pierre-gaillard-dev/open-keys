import {
  DEFAULT_HANDS_SETTINGS,
  libraryEntrySchema,
  loopSchema,
  practiceHistorySchema,
  practiceSessionSchema,
  practiceStatsSchema,
  songDetailSchema,
} from "@open-keys/contracts";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { twoHandMidi } from "../../test/fixtures";
import { createTestServer, TEST_PASSWORD, type TestServer } from "../../test/test-server";

const LOOP_ID = "01JD0000000000000000000001";
const SESSION_ID = "01JD0000000000000000000002";
let server: TestServer;
let songId: string;

afterEach(() => server?.close());

async function setup() {
  server = await createTestServer();
  await server.login();
  const song = songDetailSchema.parse(
    await (await server.upload("/api/imports/file", twoHandMidi(), "a.mid")).json(),
  );
  songId = song.id;
}

function loopBody(overrides: object = {}) {
  return {
    songId,
    name: "Mesures 12-16",
    startMs: 42_000,
    endMs: 51_000,
    targetTempoPct: null,
    bestTempoPct: null,
    createdAt: 1000,
    updatedAt: 1000,
    deletedAt: null,
    ...overrides,
  };
}

function sessionBody(overrides: object = {}) {
  return {
    songId,
    loopId: null,
    mode: "watch",
    startedAt: 10_000,
    endedAt: 70_000,
    activeMs: 50_000,
    minTempoPct: 50,
    maxTempoPct: 75,
    accuracy: null,
    score: null,
    updatedAt: 70_000,
    ...overrides,
  };
}

function libraryBody(overrides: object = {}) {
  return {
    status: "learning",
    isFavorite: true,
    lastPositionMs: 12_000,
    lastTempoPct: 75,
    handsSettings: DEFAULT_HANDS_SETTINGS,
    lastLoopId: null,
    lastPracticedAt: 5000,
    updatedAt: 5000,
    ...overrides,
  };
}

async function loops() {
  return z.array(loopSchema).parse(await (await server.request(`/api/songs/${songId}/loops`)).json());
}

describe("loops", () => {
  it("are created with a client id and listed by start time", async () => {
    await setup();

    const created = await server.json("PUT", `/api/loops/${LOOP_ID}`, loopBody());

    expect(created.status).toBe(200);
    expect(loopSchema.parse(await created.json())).toMatchObject({ id: LOOP_ID, name: "Mesures 12-16" });
    expect((await loops()).map((loop) => loop.id)).toEqual([LOOP_ID]);
  });

  it("follow last-write-wins: an older version is ignored", async () => {
    await setup();
    await server.json("PUT", `/api/loops/${LOOP_ID}`, loopBody({ name: "v2", updatedAt: 2000 }));

    const stale = await server.json(
      "PUT",
      `/api/loops/${LOOP_ID}`,
      loopBody({ name: "v1", updatedAt: 1500 }),
    );

    expect(loopSchema.parse(await stale.json()).name).toBe("v2");
  });

  it("are soft deleted", async () => {
    await setup();
    await server.json("PUT", `/api/loops/${LOOP_ID}`, loopBody());

    expect((await server.request(`/api/loops/${LOOP_ID}`, { method: "DELETE" })).status).toBe(204);
    expect(await loops()).toEqual([]);
  });

  it("reject an end before the start and an unknown song", async () => {
    await setup();

    expect((await server.json("PUT", `/api/loops/${LOOP_ID}`, loopBody({ endMs: 1 }))).status).toBe(400);
    const unknownSong = loopBody({ songId: "01ARYZ6S41TSV4RRFFQ69G5FAV" });
    expect((await server.json("PUT", `/api/loops/${LOOP_ID}`, unknownSong)).status).toBe(404);
  });

  it("belong to their user: another user can neither see nor overwrite them", async () => {
    await setup();
    await server.json("PUT", `/api/loops/${LOOP_ID}`, loopBody());
    await server.addUser("alice");
    await server.login("alice", TEST_PASSWORD);

    expect(await loops()).toEqual([]);
    expect((await server.json("PUT", `/api/loops/${LOOP_ID}`, loopBody({ updatedAt: 9999 }))).status).toBe(
      404,
    );
    expect((await server.request(`/api/loops/${LOOP_ID}`, { method: "DELETE" })).status).toBe(404);
  });
});

describe("practice sessions", () => {
  it("are idempotent and feed the statistics", async () => {
    await setup();

    await server.json("PUT", `/api/practice-sessions/${SESSION_ID}`, sessionBody());
    const replay = await server.json("PUT", `/api/practice-sessions/${SESSION_ID}`, sessionBody());
    await server.json(
      "PUT",
      "/api/practice-sessions/01JD0000000000000000000003",
      sessionBody({ activeMs: 20_000, endedAt: 90_000 }),
    );
    const stats = practiceStatsSchema.parse(
      await (await server.request(`/api/songs/${songId}/practice-stats`)).json(),
    );

    expect(practiceSessionSchema.parse(await replay.json()).id).toBe(SESSION_ID);
    expect(stats).toEqual({ songId, totalActiveMs: 70_000, sessionCount: 2, lastPracticedAt: 90_000 });
  });

  it("refuse sessions shorter than 10 s", async () => {
    await setup();

    expect(
      (await server.json("PUT", `/api/practice-sessions/${SESSION_ID}`, sessionBody({ activeMs: 5000 })))
        .status,
    ).toBe(400);
  });

  it("drop a loop reference that does not belong to the user", async () => {
    await setup();

    const response = await server.json(
      "PUT",
      `/api/practice-sessions/${SESSION_ID}`,
      sessionBody({ loopId: LOOP_ID }),
    );

    expect(practiceSessionSchema.parse(await response.json()).loopId).toBeNull();
  });
});

describe("practice history (UC-27)", () => {
  it("lists the sessions of a period, most recent first, with their song", async () => {
    await setup();
    await server.json("PUT", `/api/practice-sessions/${SESSION_ID}`, sessionBody());
    await server.json(
      "PUT",
      "/api/practice-sessions/01JD0000000000000000000003",
      sessionBody({ startedAt: 90_000, endedAt: 150_000 }),
    );
    await server.json(
      "PUT",
      "/api/practice-sessions/01JD0000000000000000000004",
      sessionBody({ startedAt: 500_000, endedAt: 560_000 }),
    );

    const response = await server.request("/api/practice-sessions?from=5000&to=100000");
    expect(response.status).toBe(200);
    const history = practiceHistorySchema.parse(await response.json());

    expect(history.sessions.map((session) => session.startedAt)).toEqual([90_000, 10_000]);
    expect(history.sessions[0]).toMatchObject({ songId, songTitle: expect.any(String), activeMs: 50_000 });
  });

  it("is personal and limited in length", async () => {
    await setup();
    await server.json("PUT", `/api/practice-sessions/${SESSION_ID}`, sessionBody());
    await server.addUser("other");
    await server.login("other", TEST_PASSWORD);

    const mine = practiceHistorySchema.parse(
      await (await server.request("/api/practice-sessions?from=0&to=100000")).json(),
    );
    expect(mine.sessions).toEqual([]);
    // More than 400 days (from 0 up to now): refused.
    expect((await server.request("/api/practice-sessions?from=0")).status).toBe(400);
    expect((await server.request("/api/practice-sessions")).status).toBe(400);
  });
});

describe("library", () => {
  it("stores the personal state of a song and lists it", async () => {
    await setup();
    await server.json("PUT", `/api/loops/${LOOP_ID}`, loopBody());

    const response = await server.json("PUT", `/api/library/${songId}`, libraryBody({ lastLoopId: LOOP_ID }));
    const list = z.array(libraryEntrySchema).parse(await (await server.request("/api/library")).json());

    expect(libraryEntrySchema.parse(await response.json())).toMatchObject({
      songId,
      status: "learning",
      lastLoopId: LOOP_ID,
    });
    expect(list).toHaveLength(1);
  });

  it("follows last-write-wins", async () => {
    await setup();
    await server.json("PUT", `/api/library/${songId}`, libraryBody({ status: "mastered", updatedAt: 9000 }));

    const stale = await server.json(
      "PUT",
      `/api/library/${songId}`,
      libraryBody({ status: "to_learn", updatedAt: 8000 }),
    );

    expect(libraryEntrySchema.parse(await stale.json()).status).toBe("mastered");
  });

  it("stores an unknown last loop as null (not synced yet)", async () => {
    await setup();

    const response = await server.json("PUT", `/api/library/${songId}`, libraryBody({ lastLoopId: LOOP_ID }));

    expect(libraryEntrySchema.parse(await response.json()).lastLoopId).toBeNull();
  });
});
