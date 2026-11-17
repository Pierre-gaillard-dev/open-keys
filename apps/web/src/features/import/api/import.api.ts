import {
  type ConfirmImportRequest,
  type CoverSuggestion,
  coverSuggestionSchema,
  type SetCoverRequest,
  type SongDetail,
  songDetailSchema,
} from "@open-keys/contracts";
import { z } from "zod";
import { apiRequest } from "../../../shared/api";

function fileForm(file: File): FormData {
  const form = new FormData();
  form.append("file", file);
  return form;
}

export function importFile(file: File): Promise<SongDetail> {
  return apiRequest("POST", "/imports/file", { body: fileForm(file), schema: songDetailSchema });
}

export function importUrl(url: string): Promise<SongDetail> {
  return apiRequest("POST", "/imports/url", { body: { url }, schema: songDetailSchema });
}

export function confirmImport(songId: string, request: ConfirmImportRequest): Promise<SongDetail> {
  return apiRequest("POST", `/imports/${songId}/confirm`, { body: request, schema: songDetailSchema });
}

export function fetchCoverSuggestions(
  songId: string,
  title: string,
  composer: string,
): Promise<CoverSuggestion[]> {
  return apiRequest("GET", `/songs/${songId}/cover-suggestions`, {
    query: { title, composer: composer || undefined },
    schema: z.array(coverSuggestionSchema),
  });
}

export function setCover(songId: string, request: SetCoverRequest): Promise<void> {
  return apiRequest("PUT", `/songs/${songId}/cover`, { body: request });
}

export function uploadCover(songId: string, file: File): Promise<void> {
  return apiRequest("PUT", `/songs/${songId}/cover`, { body: fileForm(file) });
}

export function removeCover(songId: string): Promise<void> {
  return apiRequest("DELETE", `/songs/${songId}/cover`);
}
