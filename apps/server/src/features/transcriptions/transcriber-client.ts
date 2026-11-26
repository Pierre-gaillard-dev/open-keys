import type { TranscriptionError } from "@open-keys/contracts";

/** The transcriber service (docker/transcriber.Dockerfile), reached on the Docker network. */
export interface TranscriberClient {
  /** MIDI of the recording, or a TranscriptionFailure. */
  transcribe(audio: Uint8Array, title: string): Promise<Uint8Array>;
}

/** A failure that is the recording's, not the service's: the job fails for good. */
export class TranscriptionFailure extends Error {
  readonly code: TranscriptionError;

  constructor(code: TranscriptionError) {
    super(`Transcription failed: ${code}`);
    this.code = code;
  }
}

/** The service is busy or unreachable: the job is tried again later. */
export class TranscriberUnavailable extends Error {}

/** A 15-minute recording takes about half an hour on a small CPU. */
const TIMEOUT_MS = 60 * 60_000;

export function createTranscriberClient(baseUrl: string, fetchImpl: typeof fetch = fetch): TranscriberClient {
  const url = new URL("/transcribe", baseUrl);
  return {
    async transcribe(audio, title) {
      url.searchParams.set("title", title);
      let response: Response;
      try {
        response = await fetchImpl(url, {
          method: "POST",
          body: audio,
          headers: { "Content-Type": "application/octet-stream" },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (cause) {
        throw new TranscriberUnavailable(`Transcriber unreachable: ${String(cause)}`);
      }
      if (response.ok) {
        return new Uint8Array(await response.arrayBuffer());
      }
      const body = await response.text().catch(() => "");
      if (response.status === 503) {
        throw new TranscriberUnavailable("Transcriber busy");
      }
      if (response.status === 422) {
        throw new TranscriptionFailure(body.includes("no piano note") ? "no_notes" : "unreadable");
      }
      if (response.status === 413) {
        throw new TranscriptionFailure("too_long");
      }
      throw new TranscriptionFailure("failed");
    },
  };
}
