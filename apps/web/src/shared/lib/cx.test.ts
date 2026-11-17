import { describe, expect, it } from "vitest";
import { cx } from "./cx";

describe("cx", () => {
  it("skips falsy values", () => {
    expect(cx("a", false, null, undefined, "b")).toBe("a b");
  });

  it("lets later classes override conflicting ones", () => {
    expect(cx("inline-flex w-full", "hidden md:inline-flex w-24")).toBe("hidden md:inline-flex w-24");
  });

  it("knows the custom colour tokens", () => {
    expect(cx("border-transparent text-fg-muted", "border-fg text-fg")).toBe("border-fg text-fg");
  });
});
