import { describe, expect, it } from "vitest";
import { analyzeMidi, hasMidiHeader, InvalidMidiError } from "./analyze-midi";
import { buildMidi, scale } from "./midi-fixtures";

describe("analyzeMidi", () => {
  it("summarizes a two-hand piano file", () => {
    const bytes = buildMidi(
      [
        { name: "Right hand", channel: 0, notes: scale(60, 8) },
        { name: "Left hand", channel: 1, notes: scale(36, 4) },
      ],
      "Prelude",
    );

    const analysis = analyzeMidi(bytes);

    expect(analysis.title).toBe("Prelude");
    expect(analysis.noteCount).toBe(12);
    expect(analysis.minPitch).toBe(36);
    expect(analysis.maxPitch).toBe(67);
    expect(analysis.durationMs).toBe(4000);
    expect(analysis.tracks).toHaveLength(2);
    expect(analysis.tracks[0]).toMatchObject({
      name: "Right hand",
      noteCount: 8,
      minPitch: 60,
      maxPitch: 67,
    });
    expect(analysis.tracks[1]).toMatchObject({ name: "Left hand", channel: 1, averagePitch: 37.5 });
  });

  it.each([
    "control track",
    "Untitled score",
    "Track 1",
    "  ",
    "Piste 1",
    "Grand Piano 1",
    "Acoustic Grand Piano",
    "Piano (main droite)",
    "Staff-2",
  ])("ignores the placeholder or instrument title %j", (title) => {
    expect(analyzeMidi(buildMidi([{ notes: scale(60, 2) }], title)).title).toBeNull();
  });

  it("ignores the name of a track that plays notes (single-track files)", () => {
    const bytes = buildMidi(
      [{ name: "Elec. Piano (Classic)", notes: scale(60, 2) }],
      "Elec. Piano (Classic)",
    );

    expect(analyzeMidi(bytes).title).toBeNull();
  });

  it.each(["Piano Man", "Bring Me to Life", "Clair de lune", "Für Elise"])("keeps the title %j", (title) => {
    expect(analyzeMidi(buildMidi([{ notes: scale(60, 2) }], title)).title).toBe(title);
  });

  it("skips tracks without notes and keeps original indexes", () => {
    const bytes = buildMidi([{ name: "Tempo map", notes: [] }, { notes: scale(60, 2) }]);

    const analysis = analyzeMidi(bytes);

    expect(analysis.tracks.map((track) => track.index)).toEqual([1]);
    expect(analysis.tracks[0]?.name).toBeNull();
  });

  it("flags percussion tracks", () => {
    const bytes = buildMidi([{ notes: scale(60, 2) }, { percussion: true, notes: scale(36, 2) }]);

    expect(analyzeMidi(bytes).tracks.map((track) => track.isPercussion)).toEqual([false, true]);
  });

  it("rejects non-MIDI data", () => {
    const bytes = new TextEncoder().encode("<html>not a midi</html>");

    expect(hasMidiHeader(bytes)).toBe(false);
    expect(() => analyzeMidi(bytes)).toThrow(InvalidMidiError);
  });

  it("rejects a truncated MIDI file", () => {
    const bytes = buildMidi([{ notes: scale(60, 8) }]).slice(0, 30);

    expect(() => analyzeMidi(bytes)).toThrow(InvalidMidiError);
  });

  it("rejects a MIDI file without notes", () => {
    expect(() => analyzeMidi(buildMidi([{ notes: [] }]))).toThrow("no notes");
  });
});
