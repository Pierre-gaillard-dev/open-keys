import { songIdParamSchema } from "@open-keys/contracts";
import { Hono } from "hono";
import { AppError, type AuthedEnv, validate } from "../../shared/http";
import { audioTypeOf, isAllowedAudioUrl, parseRange } from "./song-audio";
import type { SongsService } from "./songs.service";

export interface SongAudioRoutesDeps {
  readonly songs: SongsService;
  /** AUDIO_SOURCES: the only origins whose recordings are relayed. */
  readonly audioSources: readonly string[];
  readonly fetch?: typeof fetch;
}

/** A recording never changes for a song; a day in the browser's cache, revalidated afterwards. */
const CACHE = "private, max-age=86400";
/** Headers of the source relayed as they are. */
const RELAYED = ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"];

/** The recording at its source, relayed with the byte range asked for. */
async function relay(url: string, range: string | undefined, fetchImpl: typeof fetch): Promise<Response> {
  const upstream = await fetchImpl(url, { headers: range ? { Range: range } : {} }).catch(() => null);
  if (!upstream || (upstream.status !== 200 && upstream.status !== 206)) {
    throw new AppError("NOT_FOUND", "The recording could not be fetched from its source");
  }
  const headers = new Headers({ "Cache-Control": CACHE });
  for (const name of RELAYED) {
    const value = upstream.headers.get(name);
    if (value) {
      headers.set(name, value);
    }
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}

/** A kept recording, whole or the byte range asked for. */
function serveFile(bytes: Uint8Array, sha256: string, rangeHeader: string | undefined): Response {
  const headers = new Headers({
    "Content-Type": audioTypeOf(bytes),
    "Accept-Ranges": "bytes",
    "Cache-Control": CACHE,
    ETag: `"${sha256}"`,
  });
  const range = parseRange(rangeHeader, bytes.byteLength);
  if (range === "unsatisfiable") {
    headers.set("Content-Range", `bytes */${bytes.byteLength}`);
    return new Response(null, { status: 416, headers });
  }
  if (range) {
    headers.set("Content-Range", `bytes ${range.start}-${range.end}/${bytes.byteLength}`);
    return new Response(bytes.slice(range.start, range.end + 1).buffer, { status: 206, headers });
  }
  return new Response(bytes.slice().buffer, { headers });
}

/**
 * GET /songs/:id/audio: the original recording (D35), with byte ranges (the player seeks in it).
 * A kept file is served from the storage; a URL of the audio source is relayed, so the browser only
 * ever talks to Open Keys (no cross-origin rule on the other app, no change to the page's CSP).
 */
export function createSongAudioRoutes({
  songs,
  audioSources,
  fetch: fetchImpl = fetch,
}: SongAudioRoutesDeps) {
  return new Hono<AuthedEnv>().get("/:id/audio", validate("param", songIdParamSchema), async (c) => {
    const source = songs.audioSource(c.req.valid("param").id);
    if (!source) {
      throw new AppError("NOT_FOUND", "This song has no recording");
    }
    const range = c.req.header("Range");
    if (source.kind === "url") {
      if (!isAllowedAudioUrl(source.url, audioSources)) {
        throw new AppError("NOT_FOUND", "The source of this recording is not allowed any more");
      }
      return relay(source.url, range, fetchImpl);
    }
    const bytes = await songs.readAudioFile(source.sha256);
    if (!bytes) {
      throw new AppError("NOT_FOUND", "The recording file is missing");
    }
    return serveFile(bytes, source.sha256, range);
  });
}
