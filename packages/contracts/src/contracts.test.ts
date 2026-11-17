import { describe, expect, it } from "vitest";
import { importUrlRequestSchema } from "./imports.contract";
import { putLoopRequestSchema } from "./practice.contract";
import { listSongsQuerySchema, updateSongRequestSchema } from "./songs.contract";

const SONG_ID = "01ARYZ6S41TSV4RRFFQ69G5FAV";

describe("listSongsQuerySchema", () => {
  it("parses comma-separated tags and difficulties", () => {
    expect(listSongsQuerySchema.parse({ tags: "classique, lent,", difficulty: "1,3" })).toEqual({
      tags: ["classique", "lent"],
      difficulty: [1, 3],
      sort: "created",
    });
  });

  it("rejects an out-of-range difficulty", () => {
    expect(listSongsQuerySchema.safeParse({ difficulty: "1,9" }).success).toBe(false);
  });
});

describe("updateSongRequestSchema", () => {
  it("normalizes tags to trimmed lower case", () => {
    expect(updateSongRequestSchema.parse({ tags: [" Classique "] }).tags).toEqual(["classique"]);
  });

  it("rejects a split pitch outside the piano", () => {
    expect(updateSongRequestSchema.safeParse({ splitPitch: 12 }).success).toBe(false);
  });
});

describe("importUrlRequestSchema", () => {
  it.each(["file:///etc/passwd", "ftp://example.org/a.mid", "javascript:alert(1)"])("rejects %s", (url) => {
    expect(importUrlRequestSchema.safeParse({ url }).success).toBe(false);
  });

  it("accepts an https URL", () => {
    expect(importUrlRequestSchema.safeParse({ url: "https://example.org/a.mid" }).success).toBe(true);
  });
});

describe("putLoopRequestSchema", () => {
  const loop = {
    songId: SONG_ID,
    name: "Mesures 12-16",
    startMs: 42_000,
    endMs: 51_000,
    targetTempoPct: null,
    bestTempoPct: null,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
  };

  it("accepts a valid loop", () => {
    expect(putLoopRequestSchema.safeParse(loop).success).toBe(true);
  });

  it("rejects a loop that ends before it starts", () => {
    expect(putLoopRequestSchema.safeParse({ ...loop, endMs: 1000 }).success).toBe(false);
  });

  it("rejects an invalid song id", () => {
    expect(putLoopRequestSchema.safeParse({ ...loop, songId: "../../etc" }).success).toBe(false);
  });
});
