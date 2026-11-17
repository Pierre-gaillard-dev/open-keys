import { randomBytes } from "node:crypto";
import { createUlidGenerator } from "@open-keys/core";

/** Current time in ms. Injected so tests control expirations and timestamps. */
export type Clock = () => number;

export const systemClock: Clock = () => Date.now();

export type IdGenerator = () => string;

export function createIdGenerator(clock: Clock = systemClock): IdGenerator {
  return createUlidGenerator((length) => new Uint8Array(randomBytes(length)), clock);
}
