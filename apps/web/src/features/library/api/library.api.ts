import { type LibraryEntry, libraryEntrySchema, type PutLibraryEntryRequest } from "@open-keys/contracts";
import { z } from "zod";
import { apiRequest } from "../../../shared/api";
import { outbox } from "../../../shared/offline";

export function listLibrary(): Promise<LibraryEntry[]> {
  return apiRequest("GET", "/library", { schema: z.array(libraryEntrySchema) });
}

/** Queued in the outbox: sent now if possible, otherwise when the network comes back (UC-15). */
export function putLibraryEntry(songId: string, entry: PutLibraryEntryRequest): Promise<void> {
  return outbox.put(`/library/${songId}`, entry);
}
