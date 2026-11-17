import { describe, expect, it } from "vitest";
import { computeKeyboardLayout, visibleRange, widenToWhiteKeys } from "./keyboard-layout";

describe("computeKeyboardLayout", () => {
  it("lays out the 88 keys over the width (52 white keys)", () => {
    const layout = computeKeyboardLayout(21, 108, 1040);

    expect(layout.keys.size).toBe(88);
    expect(layout.keys.get(21)).toMatchObject({ x: 0, width: 20, isBlack: false });
    expect(layout.keys.get(108)).toMatchObject({ x: 1020, width: 20 });
  });

  it("centres black keys on the boundary between two white keys", () => {
    const layout = computeKeyboardLayout(60, 64, 300);
    const cSharp = layout.keys.get(61);

    expect(cSharp).toMatchObject({ isBlack: true, width: 60 });
    expect((cSharp?.x ?? 0) + (cSharp?.width ?? 0) / 2).toBe(100);
  });
});

describe("visibleRange", () => {
  it("shows the whole piano without zoom", () => {
    expect(visibleRange(false, 60, 72)).toEqual([21, 108]);
  });

  it("frames the piece with a margin, on white keys", () => {
    expect(visibleRange(true, 62, 70)).toEqual([60, 72]);
    expect(widenToWhiteKeys(61, 66)).toEqual([60, 67]);
  });
});
