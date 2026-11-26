/** Audio formats recognised from their first bytes, for the Content-Type of a kept recording. */
const SIGNATURES: readonly { readonly type: string; readonly matches: (bytes: Uint8Array) => boolean }[] = [
  { type: "audio/ogg", matches: (b) => ascii(b, 0, 4) === "OggS" },
  {
    type: "audio/mpeg",
    matches: (b) => ascii(b, 0, 3) === "ID3" || (b[0] === 0xff && ((b[1] ?? 0) & 0xe0) === 0xe0),
  },
  { type: "audio/mp4", matches: (b) => ascii(b, 4, 8) === "ftyp" },
  { type: "audio/wav", matches: (b) => ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WAVE" },
  { type: "audio/flac", matches: (b) => ascii(b, 0, 4) === "fLaC" },
  { type: "audio/webm", matches: (b) => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3 },
];

function ascii(bytes: Uint8Array, from: number, to: number): string {
  return String.fromCharCode(...bytes.subarray(from, to));
}

export function audioTypeOf(bytes: Uint8Array): string {
  return SIGNATURES.find((signature) => signature.matches(bytes))?.type ?? "application/octet-stream";
}

/** True when `url` belongs to one of the allowed audio sources (AUDIO_SOURCES). */
export function isAllowedAudioUrl(url: string, origins: readonly string[]): boolean {
  try {
    const parsed = new URL(url);
    return (parsed.protocol === "https:" || parsed.protocol === "http:") && origins.includes(parsed.origin);
  } catch {
    return false;
  }
}

export interface ByteRange {
  readonly start: number;
  readonly end: number;
}

/**
 * The single range of a `Range: bytes=…` header within `size` bytes; null for the whole file, or
 * "unsatisfiable" when it lies outside.
 */
export function parseRange(header: string | undefined, size: number): ByteRange | null | "unsatisfiable" {
  const match = header ? /^bytes=(\d*)-(\d*)$/.exec(header.trim()) : null;
  if (!match || (match[1] === "" && match[2] === "")) {
    return null;
  }
  const [from, to] = [match[1] ?? "", match[2] ?? ""];
  const range =
    from === ""
      ? { start: Math.max(0, size - Number(to)), end: size - 1 }
      : { start: Number(from), end: to === "" ? size - 1 : Math.min(Number(to), size - 1) };
  return range.start > range.end || range.start >= size ? "unsatisfiable" : range;
}
