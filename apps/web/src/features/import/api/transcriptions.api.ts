import {
  type TranscriptionJob,
  type Transcriptions,
  type TranscriptionUrlRequest,
  transcriptionJobSchema,
  transcriptionsSchema,
} from "@open-keys/contracts";
import { apiRequest } from "../../../shared/api";

export function fetchTranscriptions(): Promise<Transcriptions> {
  return apiRequest("GET", "/transcriptions", { schema: transcriptionsSchema });
}

/** Sends a recording to be transcribed (D34); `durationS`, measured here, is for the time estimate. */
export function submitTranscription(file: File, durationS: number | null): Promise<TranscriptionJob> {
  const form = new FormData();
  form.append("file", file);
  if (durationS !== null) {
    form.append("durationS", String(Math.round(durationS)));
  }
  return apiRequest("POST", "/transcriptions", { body: form, schema: transcriptionJobSchema });
}

/** A recording of the app that fetches the recordings (D35): the song keeps its URL. */
export function submitTranscriptionUrl(request: TranscriptionUrlRequest): Promise<TranscriptionJob> {
  return apiRequest("POST", "/transcriptions/url", { body: request, schema: transcriptionJobSchema });
}
