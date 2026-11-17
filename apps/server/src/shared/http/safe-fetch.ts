import { type LookupAddress, type LookupAllOptions, lookup as systemLookup } from "node:dns";
import type { LookupFunction } from "node:net";
import ipaddr from "ipaddr.js";
import { Agent, fetch } from "undici";
import { AppError } from "./errors";

/**
 * Outgoing HTTP for user-provided URLs (MIDI import, covers): SSRF-safe by construction.
 * - http/https only, every redirect re-validated, at most `maxRedirects`;
 * - the address actually connected to must be public (checked at connection time, so DNS
 *   rebinding cannot bypass it), IP literals included;
 * - overall timeout and a byte limit enforced while streaming.
 */

export type DnsLookup = (
  hostname: string,
  options: LookupAllOptions,
  callback: (error: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void,
) => void;

export interface SafeFetchConfig {
  readonly userAgent: string;
  /** Tests only: allow loopback/private targets (local test server). */
  readonly allowPrivateNetworks?: boolean;
  /** Tests only: fake DNS. */
  readonly lookup?: DnsLookup;
}

export interface SafeFetchOptions {
  readonly maxBytes: number;
  readonly timeoutMs?: number;
  readonly maxRedirects?: number;
  readonly accept?: string;
}

export interface SafeFetchResult {
  readonly bytes: Uint8Array;
  readonly contentType: string | null;
  readonly finalUrl: string;
}

export type SafeFetch = (url: string, options: SafeFetchOptions) => Promise<SafeFetchResult>;

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_REDIRECTS = 3;
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

class BlockedAddressError extends Error {
  constructor(address: string) {
    super(`Blocked address ${address}`);
    this.name = "BlockedAddressError";
  }
}

/** Only globally routable unicast addresses (no private, loopback, link-local, reserved, mapped...). */
export function isPublicAddress(address: string): boolean {
  if (!ipaddr.isValid(address)) {
    return false;
  }
  return ipaddr.process(address).range() === "unicast";
}

function guardedLookup(baseLookup: DnsLookup, allowPrivate: boolean): LookupFunction {
  return (hostname, options, callback) => {
    baseLookup(hostname, { all: true }, (error, addresses) => {
      if (error) {
        callback(error, []);
        return;
      }
      const blocked = allowPrivate ? undefined : addresses.find((entry) => !isPublicAddress(entry.address));
      const first = addresses[0];
      if (blocked || !first) {
        callback(new BlockedAddressError(blocked?.address ?? hostname), []);
      } else if (options.all) {
        callback(null, addresses);
      } else {
        callback(null, first.address, first.family);
      }
    });
  };
}

function parseAllowedUrl(raw: string, allowPrivate: boolean): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AppError("BAD_REQUEST", "Invalid URL");
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol) || url.username || url.password) {
    throw new AppError("BAD_REQUEST", "Only plain http(s) URLs are allowed");
  }
  // Connecting to an IP literal skips DNS: check it here.
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!allowPrivate && ipaddr.isValid(host) && !isPublicAddress(host)) {
    throw new AppError("BAD_REQUEST", "URL points to a private or local network");
  }
  return url;
}

function isBlockedAddress(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
    if (current instanceof BlockedAddressError) {
      return true;
    }
    current = current.cause;
  }
  return false;
}

async function readLimited(body: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<Uint8Array> {
  if (!body) {
    return new Uint8Array();
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of body) {
    total += chunk.byteLength;
    if (total > maxBytes) {
      await body.cancel().catch(() => undefined);
      throw new AppError("PAYLOAD_TOO_LARGE", `Remote file is larger than ${maxBytes} bytes`);
    }
    chunks.push(chunk);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }
  if (isBlockedAddress(error)) {
    return new AppError("BAD_REQUEST", "URL points to a private or local network");
  }
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return new AppError("BAD_REQUEST", "The remote server did not answer in time");
  }
  return new AppError("BAD_REQUEST", "Could not download the remote file", { cause: error });
}

type UndiciResponse = Awaited<ReturnType<typeof fetch>>;

function redirectTarget(response: UndiciResponse): string | null {
  const location = response.headers.get("location");
  return response.status >= 300 && response.status < 400 ? location : null;
}

/** Validates a final (non-redirect) response and reads its body within the byte limit. */
async function readBody(response: UndiciResponse, url: URL, maxBytes: number): Promise<SafeFetchResult> {
  if (!response.ok) {
    await response.body?.cancel();
    throw new AppError("BAD_REQUEST", `The remote server answered ${response.status}`);
  }
  if (Number(response.headers.get("content-length") ?? 0) > maxBytes) {
    await response.body?.cancel();
    throw new AppError("PAYLOAD_TOO_LARGE", `Remote file is larger than ${maxBytes} bytes`);
  }
  return {
    bytes: await readLimited(response.body, maxBytes),
    contentType: response.headers.get("content-type"),
    finalUrl: url.toString(),
  };
}

export function createSafeFetch(config: SafeFetchConfig): SafeFetch {
  const allowPrivate = config.allowPrivateNetworks ?? false;
  const baseLookup: DnsLookup =
    config.lookup ?? ((hostname, options, callback) => systemLookup(hostname, options, callback));
  const dispatcher = new Agent({ connect: { lookup: guardedLookup(baseLookup, allowPrivate) } });

  const download = async (rawUrl: string, options: SafeFetchOptions): Promise<SafeFetchResult> => {
    const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
    const signal = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const headers = { "User-Agent": config.userAgent, Accept: options.accept ?? "*/*" };
    let url = parseAllowedUrl(rawUrl, allowPrivate);
    for (let redirects = 0; ; redirects++) {
      const response = await fetch(url, { dispatcher, redirect: "manual", signal, headers });
      const location = redirectTarget(response);
      if (location === null) {
        return readBody(response, url, options.maxBytes);
      }
      await response.body?.cancel();
      if (redirects >= maxRedirects) {
        throw new AppError("BAD_REQUEST", "Too many redirects");
      }
      url = parseAllowedUrl(new URL(location, url).toString(), allowPrivate);
    }
  };

  return (rawUrl, options) =>
    download(rawUrl, options).catch((error: unknown) => Promise.reject(toAppError(error)));
}
