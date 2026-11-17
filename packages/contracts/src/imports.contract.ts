import { z } from "zod";
import { songEditableFieldsSchema } from "./songs.contract";

export const importUrlRequestSchema = z.object({
  url: z.url({ protocol: /^https?$/ }).max(2000),
});

export type ImportUrlRequest = z.infer<typeof importUrlRequestSchema>;

/** Validation of a draft (UC-04): metadata, hands and optionally a suggested cover. */
export const confirmImportRequestSchema = songEditableFieldsSchema.extend({
  coverSuggestionId: z.string().min(1).optional(),
});

export type ConfirmImportRequest = z.infer<typeof confirmImportRequestSchema>;
