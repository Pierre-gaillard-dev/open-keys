/** Crockford base32, as specified by ULID. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const TIME_LENGTH = 10;
const RANDOM_LENGTH = 16;
const MAX_TIME = 2 ** 48 - 1;

/** Source of cryptographically secure random bytes (crypto.getRandomValues on each platform). */
export type RandomBytes = (length: number) => Uint8Array;

function encodeTime(time: number): string {
  if (!Number.isInteger(time) || time < 0 || time > MAX_TIME) {
    throw new RangeError(`Invalid ULID time: ${time}`);
  }
  let remaining = time;
  let encoded = "";
  for (let i = 0; i < TIME_LENGTH; i++) {
    encoded = ALPHABET.charAt(remaining % 32) + encoded;
    remaining = Math.floor(remaining / 32);
  }
  return encoded;
}

function encodeRandom(bytes: Uint8Array): string {
  let encoded = "";
  for (let i = 0; i < RANDOM_LENGTH; i++) {
    encoded += ALPHABET.charAt((bytes[i] ?? 0) % 32);
  }
  return encoded;
}

/**
 * ULID generator: 26 chars, sortable by creation time, generable offline on the client.
 * The random source is injected to keep this package free of platform APIs.
 */
export function createUlidGenerator(randomBytes: RandomBytes, now: () => number = Date.now): () => string {
  return () => encodeTime(now()) + encodeRandom(randomBytes(RANDOM_LENGTH));
}

const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export function isUlid(value: string): boolean {
  return ULID_PATTERN.test(value);
}
