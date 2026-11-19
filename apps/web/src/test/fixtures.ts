import type { SongDetail, SongSummary } from "@open-keys/contracts";

export const USER = {
  id: "01JD00000000000000000000A1",
  username: "pierre",
  role: "admin" as const,
  noteNaming: "english" as const,
};
export const MEMBER = {
  id: "01JD00000000000000000000A2",
  username: "claire",
  role: "member" as const,
  noteNaming: "english" as const,
};

let counter = 0;
function id(): string {
  counter++;
  return `01JD${String(counter).padStart(22, "0")}`;
}

export function songSummary(overrides: Partial<SongSummary> = {}): SongSummary {
  return {
    id: id(),
    title: "Gymnopédie n°1",
    composer: "Erik Satie",
    difficulty: 2,
    durationMs: 185_000,
    noteCount: 640,
    minPitch: 38,
    maxPitch: 86,
    tags: ["lent"],
    cover: null,
    library: null,
    createdAt: 1,
    ...overrides,
  };
}

export function songDetail(overrides: Partial<SongDetail> = {}): SongDetail {
  const summary = songSummary();
  return {
    ...summary,
    state: "ready",
    sourceType: "upload",
    sourceUrl: null,
    sourceLibrary: null,
    license: null,
    credit: null,
    handMode: "tracks",
    splitPitch: 60,
    tracks: [
      {
        id: id(),
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
        id: id(),
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
    noteHands: null,
    canEdit: true,
    midiUrl: `/api/songs/${summary.id}/midi`,
    updatedAt: 1,
    ...overrides,
  };
}
