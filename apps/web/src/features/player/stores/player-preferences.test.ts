import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLAYER_PREFERENCES,
  loadPlayerPreferences,
  savePlayerPreferences,
} from "./player-preferences";

function memoryStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  };
}

describe("player preferences", () => {
  it("are saved and loaded back", () => {
    const storage = memoryStorage();
    savePlayerPreferences({ countIn: true, metronome: false, noteNames: "both" }, storage);

    expect(loadPlayerPreferences(storage)).toEqual({ countIn: true, metronome: false, noteNames: "both" });
  });

  it("fall back to the defaults, field by field, on unreadable or unavailable storage", () => {
    expect(loadPlayerPreferences(memoryStorage())).toEqual(DEFAULT_PLAYER_PREFERENCES);
    expect(loadPlayerPreferences(memoryStorage({ "open-keys:player-preferences": "{not json" }))).toEqual(
      DEFAULT_PLAYER_PREFERENCES,
    );
    expect(
      loadPlayerPreferences(
        memoryStorage({ "open-keys:player-preferences": '{"metronome":true,"noteNames":"x"}' }),
      ),
    ).toEqual({ countIn: false, metronome: true, noteNames: "off" });
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    expect(loadPlayerPreferences(broken)).toEqual(DEFAULT_PLAYER_PREFERENCES);
    expect(() => savePlayerPreferences(DEFAULT_PLAYER_PREFERENCES, broken)).not.toThrow();
  });
});
