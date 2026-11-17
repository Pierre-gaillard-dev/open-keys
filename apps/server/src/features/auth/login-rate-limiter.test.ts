import { describe, expect, it } from "vitest";
import { createLoginRateLimiter } from "./login-rate-limiter";

describe("createLoginRateLimiter", () => {
  it("blocks after the maximum number of failures, until the window slides", () => {
    let now = 0;
    const limiter = createLoginRateLimiter(() => now, { maxFailures: 3, windowMs: 1000 });

    for (let i = 0; i < 3; i++) {
      expect(limiter.retryAfterMs("ip|user")).toBe(0);
      limiter.recordFailure("ip|user");
      now += 100;
    }

    expect(limiter.retryAfterMs("ip|user")).toBe(700);
    now = 1001;
    expect(limiter.retryAfterMs("ip|user")).toBe(0);
  });

  it("isolates keys and resets on success", () => {
    const limiter = createLoginRateLimiter(() => 0, { maxFailures: 1, windowMs: 1000 });

    limiter.recordFailure("a");

    expect(limiter.retryAfterMs("a")).toBeGreaterThan(0);
    expect(limiter.retryAfterMs("b")).toBe(0);
    limiter.reset("a");
    expect(limiter.retryAfterMs("a")).toBe(0);
  });
});
