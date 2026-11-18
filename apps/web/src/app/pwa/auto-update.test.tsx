import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installFakeApi } from "../../test/fake-api";
import { USER } from "../../test/fixtures";
import { renderApp } from "../../test/render-app";
import { currentHref, pwaStore } from "./pwa.store";
import { STARTUP_WINDOW_MS } from "./use-auto-update";

afterEach(() => {
  pwaStore.setState({ update: null });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function openCatalogue() {
  installFakeApi({
    "GET /api/auth/me": () => ({ json: USER }),
    "GET /api/songs": () => ({ json: [] }),
    "GET /api/tags": () => ({ json: [] }),
    "GET /api/practice-sessions": () => ({ json: { sessions: [] } }),
  });
  renderApp("/");
  await screen.findByRole("heading", { name: "Catalogue" });
}

function newVersion() {
  const apply = vi.fn(() => Promise.resolve());
  act(() => pwaStore.setState({ update: { apply, href: currentHref() } }));
  return apply;
}

describe("app update (D22)", () => {
  it("applies a version found right after the start", async () => {
    await openCatalogue();
    vi.spyOn(performance, "now").mockReturnValue(STARTUP_WINDOW_MS - 1);

    const apply = newVersion();

    expect(apply).toHaveBeenCalledOnce();
  });

  it("later, waits for the next page change, without asking", async () => {
    await openCatalogue();
    vi.spyOn(performance, "now").mockReturnValue(STARTUP_WINDOW_MS * 4);

    const apply = newVersion();
    expect(apply).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Mettre à jour/ })).toBeNull();

    await userEvent.click(screen.getAllByRole("link", { name: "Progression" })[0] as HTMLElement);
    await waitFor(() => expect(apply).toHaveBeenCalledOnce());
  });
});
