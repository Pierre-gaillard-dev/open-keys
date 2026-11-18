import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useFullscreen } from "./use-fullscreen";

/** jsdom has no Fullscreen API: the document is given one. */
function fakeFullscreen(element: Element | null) {
  const exitFullscreen = vi.fn(() => Promise.resolve());
  Object.defineProperty(document, "exitFullscreen", { value: exitFullscreen, configurable: true });
  Object.defineProperty(document, "fullscreenElement", { value: element, configurable: true });
  return exitFullscreen;
}

afterEach(() => {
  Object.defineProperty(document, "fullscreenElement", { value: null, configurable: true });
});

describe("useFullscreen", () => {
  it("leaves the full screen when the player closes", () => {
    const exitFullscreen = fakeFullscreen(document.documentElement);
    const { unmount } = renderHook(() => useFullscreen());

    unmount();

    expect(exitFullscreen).toHaveBeenCalledOnce();
  });

  it("does nothing when the player was not in full screen", () => {
    const exitFullscreen = fakeFullscreen(null);

    renderHook(() => useFullscreen()).unmount();

    expect(exitFullscreen).not.toHaveBeenCalled();
  });
});
