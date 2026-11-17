import { createUlidGenerator } from "@open-keys/core";

/** ULID generated on the client (loops, sessions): created offline-ready, sent with idempotent PUTs. */
export const newId = createUlidGenerator((length) => crypto.getRandomValues(new Uint8Array(length)));
