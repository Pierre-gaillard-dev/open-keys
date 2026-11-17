import { describe, expect, it } from "vitest";
import { createPasswordHasher } from "./password-hasher";

const hasher = createPasswordHasher({ memory: 1024, passes: 1, parallelism: 1 });

describe("createPasswordHasher", () => {
  it("produces a salted argon2id PHC string", async () => {
    const first = await hasher.hash("correct horse battery staple");
    const second = await hasher.hash("correct horse battery staple");

    expect(first.startsWith("$argon2id$v=19$m=1024,t=1,p=1$")).toBe(true);
    expect(first).not.toBe(second);
  });

  it("verifies the right password only", async () => {
    const encoded = await hasher.hash("correct horse battery staple");

    expect(await hasher.verify("correct horse battery staple", encoded)).toBe(true);
    expect(await hasher.verify("wrong password", encoded)).toBe(false);
  });

  it("rejects malformed hashes", async () => {
    expect(await hasher.verify("anything", "plain-text")).toBe(false);
  });
});
