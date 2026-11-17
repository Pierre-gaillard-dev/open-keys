import { coverSuggestionSchema, songDetailSchema } from "@open-keys/contracts";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { pngImage, twoHandMidi } from "../../test/fixtures";
import { createTestServer, type TestServer, type TestServerOptions } from "../../test/test-server";
import type { CoverProvider } from "./providers/cover-provider.types";

let server: TestServer;

afterEach(() => server?.close());

const ALBUM_URL = "https://coverartarchive.org/release-group/abc/front-1200";
const ALBUM_THUMB = "https://coverartarchive.org/release-group/abc/front-250";

const albumProvider: CoverProvider = {
  source: "musicbrainz",
  search: () =>
    Promise.resolve([
      {
        source: "musicbrainz",
        thumbnailUrl: ALBUM_THUMB,
        imageUrl: ALBUM_URL,
        label: "Album",
        credit: "Cover Art Archive",
      },
    ]),
};
const brokenProvider: CoverProvider = {
  source: "wikidata",
  search: () => Promise.reject(new Error("Wikidata is down")),
};

async function serverWithSong(options: TestServerOptions = {}) {
  server = await createTestServer(options);
  await server.login();
  const response = await server.upload("/api/imports/file", twoHandMidi(), "a.mid");
  return songDetailSchema.parse(await response.json());
}

async function coverOf(songId: string) {
  return songDetailSchema.parse(await (await server.request(`/api/songs/${songId}`)).json()).cover;
}

describe("PUT /api/songs/:id/cover (upload)", () => {
  it("re-encodes the image as a 720×720 WebP and exposes a versioned URL", async () => {
    const song = await serverWithSong();

    const response = await server.uploadWith(
      "PUT",
      `/api/songs/${song.id}/cover`,
      await pngImage(1000, 600),
      "c.png",
    );
    const cover = await coverOf(song.id);
    const image = await server.request(cover?.url ?? "");
    const metadata = await sharp(new Uint8Array(await image.arrayBuffer())).metadata();

    expect(response.status).toBe(204);
    expect(cover).toMatchObject({ source: "upload", credit: null });
    expect(cover?.url).toMatch(new RegExp(`^/api/songs/${song.id}/cover\\?v=[a-f0-9]{16}$`));
    expect(image.headers.get("Content-Type")).toBe("image/webp");
    expect([metadata.format, metadata.width, metadata.height]).toEqual(["webp", 720, 720]);
  });

  it("rejects something that is not an image", async () => {
    const song = await serverWithSong();

    const response = await server.uploadWith("PUT", `/api/songs/${song.id}/cover`, twoHandMidi(), "c.png");

    expect(response.status).toBe(400);
  });

  it("can be removed to fall back to the generated cover", async () => {
    const song = await serverWithSong();
    await server.uploadWith("PUT", `/api/songs/${song.id}/cover`, await pngImage(), "c.png");

    expect((await server.request(`/api/songs/${song.id}/cover`, { method: "DELETE" })).status).toBe(204);
    expect(await coverOf(song.id)).toBeNull();
    expect((await server.request(`/api/songs/${song.id}/cover`)).status).toBe(404);
  });
});

describe("cover suggestions", () => {
  it("merges providers and tolerates a failing one", async () => {
    const song = await serverWithSong({ coverProviders: [albumProvider, brokenProvider] });

    const response = await server.request(
      `/api/songs/${song.id}/cover-suggestions?title=Gymnopedie&composer=Satie`,
    );
    const suggestions = z.array(coverSuggestionSchema).parse(await response.json());

    expect(suggestions).toEqual([
      {
        id: expect.any(String),
        source: "musicbrainz",
        thumbnailUrl: ALBUM_THUMB,
        label: "Album",
        credit: "Cover Art Archive",
      },
    ]);
    expect(server.logs.some((log) => log.entry["message"] === "Cover provider failed")).toBe(true);
  });

  it("applies a suggestion by id, downloading the large image", async () => {
    const song = await serverWithSong({
      coverProviders: [albumProvider],
      remoteFiles: { [ALBUM_URL]: await pngImage() },
    });
    const [suggestion] = z
      .array(coverSuggestionSchema)
      .parse(await (await server.request(`/api/songs/${song.id}/cover-suggestions?title=x`)).json());

    const response = await server.json("PUT", `/api/songs/${song.id}/cover`, {
      suggestionId: suggestion?.id,
    });

    expect(response.status).toBe(204);
    expect(await coverOf(song.id)).toMatchObject({ source: "musicbrainz", credit: "Cover Art Archive" });
  });

  it("can be chosen while confirming an import", async () => {
    const song = await serverWithSong({
      coverProviders: [albumProvider],
      remoteFiles: { [ALBUM_THUMB]: await pngImage() },
    });
    const [suggestion] = z
      .array(coverSuggestionSchema)
      .parse(await (await server.request(`/api/songs/${song.id}/cover-suggestions?title=x`)).json());

    const confirmed = await server.json("POST", `/api/imports/${song.id}/confirm`, {
      title: "Titre",
      composer: null,
      difficulty: null,
      license: null,
      tags: [],
      handMode: song.handMode,
      splitPitch: song.splitPitch,
      tracks: [],
      coverSuggestionId: suggestion?.id,
    });

    // The large image is missing remotely: the thumbnail is used instead.
    expect(songDetailSchema.parse(await confirmed.json()).cover?.source).toBe("musicbrainz");
  });

  it("rejects an unknown or expired suggestion", async () => {
    const song = await serverWithSong({ coverProviders: [albumProvider] });
    const [suggestion] = z
      .array(coverSuggestionSchema)
      .parse(await (await server.request(`/api/songs/${song.id}/cover-suggestions?title=x`)).json());
    server.advance(60 * 60_000 + 1);

    const response = await server.json("PUT", `/api/songs/${song.id}/cover`, {
      suggestionId: suggestion?.id,
    });

    expect(response.status).toBe(404);
  });
});

describe("PUT /api/songs/:id/cover (url)", () => {
  it("downloads the image through the safe fetcher", async () => {
    const url = "https://example.org/cover.png";
    const song = await serverWithSong({ remoteFiles: { [url]: await pngImage() } });

    const response = await server.json("PUT", `/api/songs/${song.id}/cover`, { url });

    expect(response.status).toBe(204);
    expect(server.fetchedUrls).toContain(url);
    expect((await coverOf(song.id))?.source).toBe("url");
  });

  it("rejects an invalid body", async () => {
    const song = await serverWithSong();

    expect((await server.json("PUT", `/api/songs/${song.id}/cover`, { url: "ftp://x" })).status).toBe(400);
  });
});
