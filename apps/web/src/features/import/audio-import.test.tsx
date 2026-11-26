import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFakeApi } from "../../test/fake-api";
import { USER } from "../../test/fixtures";
import { renderApp } from "../../test/render-app";

/** jsdom loads no media: a recording "of 3 minutes", known at once. */
class FakeAudio {
  duration = 180;
  preload = "";
  onloadedmetadata: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_url: string) {
    queueMicrotask(() => this.onloadedmetadata?.());
  }
}

beforeEach(() => {
  vi.stubGlobal("Audio", FakeAudio);
  URL.createObjectURL = () => "blob:recording";
  URL.revokeObjectURL = () => undefined;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const job = (overrides: object) => ({
  id: "01JD0000000000000000000T01",
  fileName: "One More Light.opus",
  status: "queued",
  durationS: 180,
  queuePosition: 0,
  songId: null,
  error: null,
  createdAt: Date.now(),
  startedAt: null,
  finishedAt: null,
  ...overrides,
});

describe("import from a recording (D34)", () => {
  it("sends a recording with its length, follows it, then opens the review once transcribed", async () => {
    let jobs: object[] = [];
    const api = installFakeApi({
      "GET /api/auth/me": () => ({ json: USER }),
      "GET /api/transcriptions": () => ({ json: { available: true, jobs } }),
      "POST /api/transcriptions": () => {
        jobs = [job({})];
        return { status: 201, json: jobs[0] };
      },
    });
    renderApp("/import/audio");

    const input = await screen.findByLabelText("Enregistrement à transcrire");
    await userEvent.upload(input, new File(["opus"], "One More Light.opus", { type: "audio/ogg" }));

    expect(await screen.findByText("En attente, c'est la prochaine")).toBeDefined();
    const sent = api.calls("POST", "/api/transcriptions")[0]?.body as FormData;
    expect(sent.get("durationS")).toBe("180");
    expect((sent.get("file") as File).name).toBe("One More Light.opus");

    jobs = [job({ status: "done", songId: "01JD0000000000000000000S01", queuePosition: null })];
    // The list is polled while a transcription is in progress.
    await waitFor(
      () =>
        expect(screen.getByRole("link", { name: /Vérifier/ }).getAttribute("href")).toBe(
          "/import/01JD0000000000000000000S01",
        ),
      { timeout: 7000 },
    );
  }, 10_000);

  it("says when the server cannot transcribe", async () => {
    installFakeApi({
      "GET /api/auth/me": () => ({ json: USER }),
      "GET /api/transcriptions": () => ({ json: { available: false, jobs: [] } }),
    });
    renderApp("/import/audio");

    expect(await screen.findByText(/n'a pas de service de transcription/)).toBeDefined();
    expect(screen.queryByLabelText("Enregistrement à transcrire")).toBeNull();
  });
});
