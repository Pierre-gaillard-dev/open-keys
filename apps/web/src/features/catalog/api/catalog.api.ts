import {
  type SongDetail,
  type SongSummary,
  songDetailSchema,
  songSummarySchema,
  type Tag,
  tagSchema,
  type UpdateSongRequest,
} from "@open-keys/contracts";
import { z } from "zod";
import { apiRequest } from "../../../shared/api";
import { type CatalogSearch, toSongsQuery } from "../catalog-search";

export function listSongs(search: CatalogSearch, signal?: AbortSignal): Promise<SongSummary[]> {
  return apiRequest("GET", "/songs", {
    query: toSongsQuery(search),
    schema: z.array(songSummarySchema),
    ...(signal ? { signal } : {}),
  });
}

export function getSong(id: string): Promise<SongDetail> {
  return apiRequest("GET", `/songs/${id}`, { schema: songDetailSchema });
}

export function updateSong(id: string, changes: UpdateSongRequest): Promise<SongDetail> {
  return apiRequest("PATCH", `/songs/${id}`, { body: changes, schema: songDetailSchema });
}

export function deleteSong(id: string): Promise<void> {
  return apiRequest("DELETE", `/songs/${id}`);
}

export function listTags(): Promise<Tag[]> {
  return apiRequest("GET", "/tags", { schema: z.array(tagSchema) });
}
