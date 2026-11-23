import { describe, expect, it } from "vitest";
import { newAttempt, recentNotes, recordFrame } from "./lab-attempt";

const CHORD = [60, 64, 67];
/** Frames every 21 ms from `from`, each hearing `heard`. */
function play(attempt: ReturnType<typeof newAttempt>, from: number, heard: number[], count = 3) {
  for (let i = 0; i < count; i++) {
    recordFrame(attempt, from + i * 0.021, heard, CHORD);
  }
}

describe("lab attempt (one strike)", () => {
  it("recognises a chord whose notes are all heard from one strike", () => {
    const attempt = newAttempt();
    play(attempt, 0, [60, 64]);
    play(attempt, 0.06, [60, 64, 67]);
    expect(attempt.spreadS).toBeCloseTo(0.06, 3);
  });

  it("does not add up strikes: a note missing from each one never completes the chord", () => {
    const attempt = newAttempt();
    play(attempt, 0, [60, 64]);
    play(attempt, 0.1, []);
    play(attempt, 1, [67]);
    play(attempt, 1.1, []);
    expect(attempt.spreadS).toBeNull();
  });

  it("needs two frames in a row, and lights the notes heard recently", () => {
    const attempt = newAttempt();
    recordFrame(attempt, 0, [60], CHORD);
    recordFrame(attempt, 0.021, [], CHORD);
    expect(recentNotes(attempt, 0.05, 1).size).toBe(0);
    play(attempt, 0.1, [60]);
    expect([...recentNotes(attempt, 0.5, 1)]).toEqual([60]);
    expect(recentNotes(attempt, 2, 1).size).toBe(0);
  });
});
