import { argon2, randomBytes, timingSafeEqual } from "node:crypto";

export interface Argon2Cost {
  /** KiB */
  readonly memory: number;
  readonly passes: number;
  readonly parallelism: number;
}

/** OWASP-compliant argon2id cost (64 MiB, 3 passes). Tests use a cheaper cost. */
export const DEFAULT_ARGON2_COST: Argon2Cost = { memory: 65_536, passes: 3, parallelism: 1 };

const TAG_LENGTH = 32;
const SALT_LENGTH = 16;
const PHC_PATTERN = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, encoded: string): Promise<boolean>;
}

function derive(password: string, salt: Buffer, cost: Argon2Cost): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    argon2("argon2id", { message: password, nonce: salt, tagLength: TAG_LENGTH, ...cost }, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

const toB64 = (buffer: Buffer) => buffer.toString("base64").replace(/=+$/, "");

/** argon2id from node:crypto (no native dependency), stored in PHC string format. */
export function createPasswordHasher(cost: Argon2Cost = DEFAULT_ARGON2_COST): PasswordHasher {
  return {
    async hash(password) {
      const salt = randomBytes(SALT_LENGTH);
      const key = await derive(password, salt, cost);
      const params = `m=${cost.memory},t=${cost.passes},p=${cost.parallelism}`;
      return ["", "argon2id", "v=19", params, toB64(salt), toB64(key)].join("$");
    },
    async verify(password, encoded) {
      const match = PHC_PATTERN.exec(encoded);
      if (!match) {
        return false;
      }
      const [, memory, passes, parallelism, salt, expected] = match;
      const expectedKey = Buffer.from(expected ?? "", "base64");
      const key = await derive(password, Buffer.from(salt ?? "", "base64"), {
        memory: Number(memory),
        passes: Number(passes),
        parallelism: Number(parallelism),
      });
      return key.length === expectedKey.length && timingSafeEqual(key, expectedKey);
    },
  };
}
