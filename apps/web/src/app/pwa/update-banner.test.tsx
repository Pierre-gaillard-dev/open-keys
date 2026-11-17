import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installFakeApi } from "../../test/fake-api";
import { USER } from "../../test/fixtures";
import { renderApp } from "../../test/render-app";
import { pwaStore } from "./pwa.store";

afterEach(() => {
  pwaStore.setState({ applyUpdate: null });
  vi.unstubAllGlobals();
});

function catalogueApi() {
  installFakeApi({
    "GET /api/auth/me": () => ({ json: USER }),
    "GET /api/songs": () => ({ json: [] }),
    "GET /api/tags": () => ({ json: [] }),
  });
}

describe("app update", () => {
  it("offers the new version and applies it on demand", async () => {
    catalogueApi();
    const applyUpdate = vi.fn(() => Promise.resolve());
    renderApp("/");
    await screen.findByRole("heading", { name: "Catalogue" });
    expect(screen.queryByRole("region", { name: "Mise à jour" })).toBeNull();

    pwaStore.setState({ applyUpdate });
    await userEvent.click(await screen.findByRole("button", { name: "Mettre à jour" }));

    expect(applyUpdate).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Mettre à jour" }).hasAttribute("disabled")).toBe(true);
  });
});
