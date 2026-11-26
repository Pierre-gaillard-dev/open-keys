import type { TranscriptionJob } from "@open-keys/contracts";
import { describe, expect, it } from "vitest";
import { minutesLeft, SECONDS_PER_SECOND_OF_AUDIO, statusText } from "./transcription-status";

const job = (overrides: Partial<TranscriptionJob>): TranscriptionJob => ({
  id: "01JD0000000000000000000T01",
  fileName: "reprise.opus",
  status: "queued",
  durationS: 240,
  queuePosition: 0,
  songId: null,
  error: null,
  createdAt: 0,
  startedAt: null,
  finishedAt: null,
  ...overrides,
});

describe("transcription status", () => {
  it("estimates the minutes left from the recording's length", () => {
    const running = job({ status: "running", startedAt: 0, queuePosition: null });
    const total = 240 * SECONDS_PER_SECOND_OF_AUDIO;
    expect(minutesLeft(running, 0)).toBe(Math.ceil(total / 60));
    expect(minutesLeft(running, (total - 90) * 1000)).toBe(2);
    // Past the estimate: still "about 1 min", never 0 or less.
    expect(minutesLeft(running, (total + 600) * 1000)).toBe(1);
    expect(minutesLeft({ ...running, durationS: null }, 0)).toBeNull();
  });

  it("says where each transcription is", () => {
    expect(statusText(job({ queuePosition: 0 }), 0)).toBe("En attente, c'est la prochaine");
    expect(statusText(job({ queuePosition: 2 }), 0)).toBe("En attente (2 avant)");
    expect(statusText(job({ status: "running", startedAt: 0, durationS: null }), 0)).toBe(
      "Transcription en cours…",
    );
    expect(statusText(job({ status: "failed", error: "no_notes" }), 0)).toMatch(/Aucune note de piano/);
  });
});
