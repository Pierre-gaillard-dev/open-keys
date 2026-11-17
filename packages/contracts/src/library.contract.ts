import { z } from "zod";
import { tempoPctSchema, timestampSchema, ulidSchema } from "./common.contract";

export const SONG_STATUSES = ["to_learn", "learning", "mastered"] as const;

export const songStatusSchema = z.enum(SONG_STATUSES);

export type SongStatus = z.infer<typeof songStatusSchema>;

const handSettingsSchema = z.object({ audible: z.boolean(), visible: z.boolean() });

export const handsSettingsSchema = z.object({ left: handSettingsSchema, right: handSettingsSchema });

export type HandsSettings = z.infer<typeof handsSettingsSchema>;

export const DEFAULT_HANDS_SETTINGS: HandsSettings = {
  left: { audible: true, visible: true },
  right: { audible: true, visible: true },
};

/** Personal state of a song for the current user (UC-12, UC-13). Synced with last-write-wins. */
export const libraryEntrySchema = z.object({
  songId: ulidSchema,
  status: songStatusSchema,
  isFavorite: z.boolean(),
  lastPositionMs: z.number().int().nonnegative(),
  lastTempoPct: tempoPctSchema,
  handsSettings: handsSettingsSchema,
  lastLoopId: ulidSchema.nullable(),
  lastPracticedAt: timestampSchema.nullable(),
  updatedAt: timestampSchema,
});

export type LibraryEntry = z.infer<typeof libraryEntrySchema>;

export const putLibraryEntryRequestSchema = libraryEntrySchema.omit({ songId: true });

export type PutLibraryEntryRequest = z.infer<typeof putLibraryEntryRequestSchema>;
