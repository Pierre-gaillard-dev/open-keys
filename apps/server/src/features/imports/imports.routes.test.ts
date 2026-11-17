import { errorResponseSchema, type SongDetail, songDetailSchema } from "@open-keys/contracts";
import { afterEach, describe, expect, it } from "vitest";
import { singleTrackMidi, twoHandMidi } from "../../test/fixtures";
import { createTestServer, type TestServer } from "../../test/test-server";
import { titleFromName } from "./imports.service";

let server: TestServer;

afterEach(() => server?.close());

async function asSong(response: Response): Promise<SongDetail> {
  return songDetailSchema.parse(await response.json());
}

async function errorOf(response: Response) {
  return errorResponseSchema.parse(await response.json()).error;
}

function confirmBody(song: SongDetail, overrides: Record<string, unknown> = {}) {
  return {
    title: "Prélude en C",
    composer: "J. S. Bach",
    difficulty: 3,
    license: "Public Domain",
    tags: ["Classique", "baroque"],
    handMode: song.handMode,
    splitPitch: song.splitPitch,
    tracks: song.tracks.map((track) => ({ id: track.id, hand: track.hand })),
    ...overrides,
  };
}

describe("titleFromName", () => {
  it.each([
    ["gymnopedie_1.mid", "gymnopedie 1"],
    ["Für-Elise.MIDI", "Für Elise"],
    [".mid", "Sans titre"],
  ])("%s → %s", (name, title) => {
    expect(titleFromName(name)).toBe(title);
  });
});

describe("POST /api/imports/file", () => {
  it("analyses the file and creates a draft with a hand suggestion", async () => {
    server = await createTestServer();
    await server.login();

    const response = await server.upload("/api/imports/file", twoHandMidi("Prelude"), "prelude.mid");
    const song = await asSong(response);

    expect(response.status).toBe(201);
    expect(song).toMatchObject({
      state: "draft",
      title: "Prelude",
      sourceType: "upload",
      handMode: "tracks",
    });
    expect(song.noteCount).toBe(12);
    expect(song.tracks.map((track) => [track.name, track.hand])).toEqual([
      ["Right hand", "right"],
      ["Left hand", "left"],
    ]);
    expect((await server.storage.list("midi")).length).toBe(1);
  });

  it("uses the file name as title and splits a single track at C4", async () => {
    server = await createTestServer();
    await server.login();

    const song = await asSong(await server.upload("/api/imports/file", singleTrackMidi(), "ma_chanson.mid"));

    expect(song.title).toBe("ma chanson");
    expect(song).toMatchObject({ handMode: "split", splitPitch: 60 });
  });

  it("rejects a file that is not MIDI", async () => {
    server = await createTestServer();
    await server.login();

    const response = await server.upload("/api/imports/file", new TextEncoder().encode("<html>"), "fake.mid");

    expect(response.status).toBe(400);
    expect((await errorOf(response)).message).toContain("Invalid MIDI file");
  });

  it("rejects files above the size limit", async () => {
    server = await createTestServer({ env: { MAX_MIDI_SIZE: "100" } });
    await server.login();

    const response = await server.upload("/api/imports/file", twoHandMidi(), "big.mid");

    expect(response.status).toBe(413);
  });

  it("requires a file field", async () => {
    server = await createTestServer();
    await server.login();

    const response = await server.request("/api/imports/file", { method: "POST", body: new FormData() });

    expect(response.status).toBe(400);
  });

  it("returns the same draft when the file is uploaded twice", async () => {
    server = await createTestServer();
    await server.login();

    const first = await asSong(await server.upload("/api/imports/file", twoHandMidi(), "a.mid"));
    const second = await server.upload("/api/imports/file", twoHandMidi(), "b.mid");

    expect(second.status).toBe(200);
    expect((await asSong(second)).id).toBe(first.id);
  });

  it("detects a file already in the catalogue", async () => {
    server = await createTestServer();
    await server.login();
    const draft = await asSong(await server.upload("/api/imports/file", twoHandMidi(), "a.mid"));
    await server.json("POST", `/api/imports/${draft.id}/confirm`, confirmBody(draft));

    const response = await server.upload("/api/imports/file", twoHandMidi(), "again.mid");

    expect(response.status).toBe(409);
    expect((await errorOf(response)).details).toMatchObject({ songId: draft.id });
  });

  it("restores a deleted song as a draft when re-imported", async () => {
    server = await createTestServer();
    await server.login();
    const draft = await asSong(await server.upload("/api/imports/file", twoHandMidi(), "a.mid"));
    await server.json("POST", `/api/imports/${draft.id}/confirm`, confirmBody(draft));
    await server.request(`/api/songs/${draft.id}`, { method: "DELETE" });

    const restored = await server.upload("/api/imports/file", twoHandMidi(), "a.mid");

    expect(restored.status).toBe(200);
    expect(await asSong(restored)).toMatchObject({ id: draft.id, state: "draft", title: "Prélude en C" });
  });
});

describe("POST /api/imports/url", () => {
  const url = "https://www.mutopiaproject.org/ftp/SatieE/gymnopedie_1/gymnopedie_1.mid";

  it("downloads the file and records its source", async () => {
    server = await createTestServer({ remoteFiles: { [url]: twoHandMidi() } });
    await server.login();

    const response = await server.json("POST", "/api/imports/url", { url });
    const song = await asSong(response);

    expect(response.status).toBe(201);
    expect(song).toMatchObject({ sourceType: "url", sourceUrl: url, title: "gymnopedie 1" });
  });

  it("ignores the placeholder title of LilyPond files (all of Mutopia)", async () => {
    server = await createTestServer({ remoteFiles: { [url]: twoHandMidi("control track") } });
    await server.login();

    const song = await asSong(await server.json("POST", "/api/imports/url", { url }));

    expect(song.title).toBe("gymnopedie 1");
  });

  it("reports an unreachable file", async () => {
    server = await createTestServer();
    await server.login();

    const response = await server.json("POST", "/api/imports/url", { url });

    expect(response.status).toBe(400);
    expect((await errorOf(response)).message).toBe("The remote server answered 404");
  });

  it("rejects non-http URLs before any download", async () => {
    server = await createTestServer();
    await server.login();

    const response = await server.json("POST", "/api/imports/url", { url: "file:///etc/passwd" });

    expect(response.status).toBe(400);
    expect(server.fetchedUrls).toEqual([]);
  });
});

describe("POST /api/imports/:id/confirm", () => {
  it("publishes the draft with its metadata, tags and hands", async () => {
    server = await createTestServer();
    await server.login();
    const draft = await asSong(await server.upload("/api/imports/file", twoHandMidi(), "a.mid"));
    const [first, second] = draft.tracks;
    const tracks = [
      { id: first?.id, hand: "left" },
      { id: second?.id, hand: "ignore" },
    ];

    const response = await server.json(
      "POST",
      `/api/imports/${draft.id}/confirm`,
      confirmBody(draft, { tracks }),
    );
    const song = await asSong(response);

    expect(response.status).toBe(200);
    expect(song).toMatchObject({
      state: "ready",
      title: "Prélude en C",
      composer: "J. S. Bach",
      difficulty: 3,
    });
    expect(song.tags).toEqual(["baroque", "classique"]);
    expect(song.tracks.map((track) => track.hand)).toEqual(["left", "ignore"]);
    const listed = (await (await server.request("/api/songs")).json()) as unknown[];
    expect(listed).toHaveLength(1);
  });

  it("cannot confirm twice", async () => {
    server = await createTestServer();
    await server.login();
    const draft = await asSong(await server.upload("/api/imports/file", twoHandMidi(), "a.mid"));
    await server.json("POST", `/api/imports/${draft.id}/confirm`, confirmBody(draft));

    const again = await server.json("POST", `/api/imports/${draft.id}/confirm`, confirmBody(draft));

    expect(again.status).toBe(409);
  });

  it("rejects tracks of another song", async () => {
    server = await createTestServer();
    await server.login();
    const draft = await asSong(await server.upload("/api/imports/file", twoHandMidi(), "a.mid"));
    const other = await asSong(await server.upload("/api/imports/file", twoHandMidi("", 3), "b.mid"));
    const foreignTracks = other.tracks.map((track) => ({ id: track.id, hand: "left" }));

    const response = await server.json(
      "POST",
      `/api/imports/${draft.id}/confirm`,
      confirmBody(draft, { tracks: foreignTracks }),
    );

    expect(response.status).toBe(400);
    expect((await asSong(await server.request(`/api/songs/${draft.id}`))).state).toBe("draft");
  });
});
