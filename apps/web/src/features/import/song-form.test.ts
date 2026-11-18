import type { SongDetail } from "@open-keys/contracts";
import { describe, expect, it } from "vitest";
import { addTag, toEditableFields, toFormValues } from "./song-form";

const TRACK_A = "01JD0000000000000000000001";
const TRACK_B = "01JD0000000000000000000002";

const song: SongDetail = {
  id: "01JD0000000000000000000009",
  title: "gymnopedie 1",
  composer: null,
  difficulty: 2,
  durationMs: 180_000,
  noteCount: 640,
  minPitch: 38,
  maxPitch: 86,
  tags: ["lent"],
  cover: null,
  library: null,
  createdAt: 1,
  state: "ready",
  sourceType: "url",
  sourceUrl: "https://example.org/g.mid",
  sourceLibrary: null,
  license: null,
  credit: null,
  handMode: "tracks",
  splitPitch: 60,
  noteHands: null,
  canEdit: true,
  tracks: [
    {
      id: TRACK_A,
      trackIndex: 1,
      channel: 0,
      name: "upper",
      instrument: null,
      noteCount: 300,
      minPitch: 60,
      maxPitch: 86,
      hand: "right",
    },
    {
      id: TRACK_B,
      trackIndex: 2,
      channel: 1,
      name: "lower",
      instrument: null,
      noteCount: 340,
      minPitch: 38,
      maxPitch: 59,
      hand: "left",
    },
  ],
  midiUrl: "/api/songs/x/midi",
  updatedAt: 1,
};

describe("song form", () => {
  it("round-trips a song into request fields", () => {
    const values = { ...toFormValues(song), composer: "  Erik Satie ", license: "" };

    const result = toEditableFields(values);

    expect(result).toEqual({
      success: true,
      fields: {
        title: "gymnopedie 1",
        composer: "Erik Satie",
        difficulty: 2,
        license: null,
        tags: ["lent"],
        handMode: "tracks",
        splitPitch: 60,
        tracks: [
          { id: TRACK_A, hand: "right" },
          { id: TRACK_B, hand: "left" },
        ],
      },
    });
  });

  it("starts a new import in the per-note mode, the split by pitch as fallback", () => {
    const values = toFormValues({ ...song, state: "draft" });

    expect(values.handsChoice).toBe("auto");
    expect(toEditableFields(values, null)).toMatchObject({ fields: { handMode: "split", noteHands: null } });
  });

  it("reports invalid fields with their path", () => {
    const result = toEditableFields({ ...toFormValues(song), title: "  ", splitPitch: 12 });

    expect(result.success).toBe(false);
    expect(result.success ? [] : result.issues.map((issue) => issue.path)).toEqual(["title", "splitPitch"]);
  });

  it("maps a missing difficulty to none and back to null", () => {
    const values = toFormValues({ ...song, difficulty: null });

    expect(values.difficulty).toBe("none");
    expect(toEditableFields(values)).toMatchObject({ fields: { difficulty: null } });
  });
});

describe("addTag", () => {
  it("normalizes and deduplicates", () => {
    expect(addTag(["lent"], " #Classique ")).toEqual(["lent", "classique"]);
    expect(addTag(["lent"], "LENT")).toEqual(["lent"]);
    expect(addTag(["lent"], "   ")).toEqual(["lent"]);
  });
});
