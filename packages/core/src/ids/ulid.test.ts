import { describe, expect, it } from "vitest";
import { createUlidGenerator, isUlid } from "./ulid";

const zeros = (length: number) => new Uint8Array(length);
const counter = () => {
  let seed = 0;
  return (length: number) => Uint8Array.from({ length }, () => seed++ % 256);
};

describe("createUlidGenerator", () => {
  it("produces 26-char Crockford base32 ids", () => {
    const id = createUlidGenerator(counter())();

    expect(id).toHaveLength(26);
    expect(isUlid(id)).toBe(true);
  });

  it("encodes the time prefix", () => {
    expect(createUlidGenerator(zeros, () => 0)()).toBe("0".repeat(26));
    expect(createUlidGenerator(zeros, () => 1_469_918_176_385)().slice(0, 10)).toBe("01ARYZ6S41");
  });

  it("sorts lexicographically by creation time", () => {
    let time = 1_700_000_000_000;
    const next = createUlidGenerator(counter(), () => time++);
    const ids = [next(), next(), next()];

    expect([...ids].sort()).toEqual(ids);
  });

  it("rejects out-of-range times", () => {
    expect(() => createUlidGenerator(zeros, () => -1)()).toThrow(RangeError);
  });
});

describe("isUlid", () => {
  it.each(["01ARYZ6S41TSV4RRFFQ69G5FAV", "0".repeat(26)])("accepts %s", (value) => {
    expect(isUlid(value)).toBe(true);
  });

  it.each(["", "01ARYZ6S41TSV4RRFFQ69G5FA", "01ARYZ6S41TSV4RRFFQ69G5FAI", "../etc/passwd"])(
    "rejects %s",
    (value) => {
      expect(isUlid(value)).toBe(false);
    },
  );
});
