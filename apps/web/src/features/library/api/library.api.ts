import { type LibraryEntry, libraryEntrySchema, type PutLibraryEntryRequest } from "@open-keys/contracts";
import { z } from "zod";
import { apiRequest } from "../../../shared/api";

export function listLibrary(): Promise<LibraryEntry[]> {
  return apiRequest("GET", "/library", { schema: z.array(libraryEntrySchema) });
}

export function putLibraryEntry(songId: string, entry: PutLibraryEntryRequest): Promise<LibraryEntry> {
  return apiRequest("PUT", `/library/${songId}`, { body: entry, schema: libraryEntrySchema });
}
