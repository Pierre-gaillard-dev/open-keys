import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installFakeApi } from "../../test/fake-api";
import { songSummary, USER } from "../../test/fixtures";
import { renderApp } from "../../test/render-app";

afterEach(() => {
  vi.unstubAllGlobals();
});

const HOUR = 60 * 60_000;

function session(id: string, songId: string, startedAt: number, minutes: number) {
  return {
    id,
    songId,
    songTitle: songId === "01JD0000000000000000000S01" ? "Gymnopédie" : "Nocturne",
    songComposer: null,
    loopId: null,
    mode: "watch",
    startedAt,
    endedAt: startedAt + minutes * 60_000,
    activeMs: minutes * 60_000,
    minTempoPct: 70,
    maxTempoPct: 85,
    accuracy: null,
    score: null,
    updatedAt: startedAt,
  };
}

describe("progress page (UC-27)", () => {
  it("shows practice time per day and per week, the songs being learned and the last sessions", async () => {
    const now = Date.now();
    const learning = songSummary({
      id: "01JD0000000000000000000S01",
      title: "Gymnopédie",
      library: { status: "learning", isFavorite: false, lastPracticedAt: now - HOUR },
    });
    const api = installFakeApi({
      "GET /api/auth/me": () => ({ json: USER }),
      "GET /api/songs": () => ({ json: [learning] }),
      "GET /api/practice-sessions": () => ({
        json: {
          sessions: [
            session("01JD000000000000000000SS01", learning.id, now - HOUR, 20),
            session("01JD000000000000000000SS02", "01JD0000000000000000000S02", now - 2 * HOUR, 10),
            session("01JD000000000000000000SS03", learning.id, now - 3 * 24 * HOUR, 25),
          ],
        },
      }),
    });
    renderApp("/progress");

    expect(await screen.findByRole("heading", { name: "Progression", level: 1 })).toBeDefined();
    // 55 min this week and this month (the oldest session is 3 days ago).
    expect(await screen.findAllByText("55 min")).toHaveLength(2);
    const chart = screen.getByRole("region", { name: "Temps de pratique" });
    expect(within(chart).getAllByRole("button", { name: /: 30 min, 2 sessions$/ })).toHaveLength(1);

    await userEvent.click(within(chart).getByRole("radio", { name: "12 semaines" }));
    expect(within(chart).getByRole("heading", { name: "Temps de pratique par semaine" })).toBeDefined();

    // In progress (1) and in the last sessions (2).
    const gymnopedie = screen.getAllByRole("link", { name: "Gymnopédie" });
    expect(gymnopedie).toHaveLength(3);
    expect(gymnopedie[0]?.getAttribute("href")).toBe(`/songs/${learning.id}`);
    expect(screen.getAllByRole("link", { name: "Nocturne" })).toHaveLength(1);
    expect(
      api.requests.find((request) => request.path === "/api/practice-sessions")?.query.get("from"),
    ).toBeTruthy();
    expect(api.requests.find((request) => request.path === "/api/songs")?.query.get("status")).toBe(
      "learning",
    );
  });
});
