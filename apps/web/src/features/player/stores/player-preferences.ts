import { z } from "zod";

/** Where note names are written (UC-23). */
export const NOTE_NAMES_MODES = ["off", "notes", "keys", "both"] as const;
export type NoteNamesMode = (typeof NOTE_NAMES_MODES)[number];

/**
 * Player options of this device, the same for every song (not synchronised: a phone on a tripod and a
 * computer are not used the same way). Hand volumes are per song, with the other hand settings.
 */
export const playerPreferencesSchema = z.object({
  /** One bar of clicks before playing and before each return to the start of the loop (UC-22). */
  countIn: z.boolean().catch(false),
  /** Clicks on every beat (UC-24). */
  metronome: z.boolean().catch(false),
  noteNames: z.enum(NOTE_NAMES_MODES).catch("off"),
});

export type PlayerPreferences = z.infer<typeof playerPreferencesSchema>;

export const DEFAULT_PLAYER_PREFERENCES: PlayerPreferences = {
  countIn: false,
  metronome: false,
  noteNames: "off",
};

const STORAGE_KEY = "open-keys:player-preferences";

/** Stored preferences, or the defaults (private browsing, storage cleared, older format). */
export function loadPlayerPreferences(
  storage: Pick<Storage, "getItem"> | undefined = globalThis.localStorage,
): PlayerPreferences {
  try {
    const stored = storage?.getItem(STORAGE_KEY);
    return stored ? playerPreferencesSchema.parse(JSON.parse(stored)) : DEFAULT_PLAYER_PREFERENCES;
  } catch {
    return DEFAULT_PLAYER_PREFERENCES;
  }
}

export function savePlayerPreferences(
  preferences: PlayerPreferences,
  storage: Pick<Storage, "setItem"> | undefined = globalThis.localStorage,
): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Storage unavailable: the preferences only last for this visit.
  }
}
