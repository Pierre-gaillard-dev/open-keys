import {
  type TranscriptionJob,
  type Transcriptions,
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
