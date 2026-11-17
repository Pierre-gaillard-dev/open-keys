import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTO_HIDE_DELAY_MS, useAutoHide } from "./use-auto-hide";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useAutoHide", () => {
  it("shows the controls on pause and hides them as soon as playback starts", () => {
    const { result, rerender } = renderHook(({ playing }) => useAutoHide(playing), {
      initialProps: { playing: false },
    });
    expect(result.current.visible).toBe(true);

    rerender({ playing: true });
    expect(result.current.visible).toBe(false);

    rerender({ playing: false });
    expect(result.current.visible).toBe(true);
  });

  it("shows them for a few seconds when poked during playback", () => {
    const { result } = renderHook(() => useAutoHide(true));

    act(() => result.current.poke());
    expect(result.current.visible).toBe(true);
    act(() => vi.advanceTimersByTime(AUTO_HIDE_DELAY_MS - 1));
    expect(result.current.visible).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.visible).toBe(false);
  });

  it("dismisses them on demand, even on pause, until poked again", () => {
    const { result } = renderHook(() => useAutoHide(false));

    act(() => result.current.hide());
    expect(result.current.visible).toBe(false);
    act(() => result.current.poke());
    act(() => vi.advanceTimersByTime(AUTO_HIDE_DELAY_MS * 2));
    expect(result.current.visible).toBe(true);
  });
});
