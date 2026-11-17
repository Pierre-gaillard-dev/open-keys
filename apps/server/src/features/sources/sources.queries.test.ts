import { describe, expect, it } from "vitest";
import { normalizeSearchText } from "./sources.queries";

describe("normalizeSearchText", () => {
  it.each([
    ["Gymnopédie No. 1", "gymnopedie no 1"],
    ['Touhou - "Bad Apple!!"', "touhou bad apple"],
    ["  Für   Élise  ", "fur elise"],
    ["Kokoro no Chizu (心の地図)", "kokoro no chizu 心の地図"],
  ])("%s → %s", (value, normalized) => {
    expect(normalizeSearchText(value)).toBe(normalized);
  });
});
