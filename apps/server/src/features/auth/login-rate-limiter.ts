import type { Clock } from "../../shared/runtime";

export interface RateLimitPolicy {
  readonly maxFailures: number;
  readonly windowMs: number;
}

/** 5 failed logins per 15 minutes per (client, username). */
export const DEFAULT_LOGIN_POLICY: RateLimitPolicy = { maxFailures: 5, windowMs: 15 * 60_000 };

export interface LoginRateLimiter {
  /** Milliseconds to wait before trying again, or 0 when allowed. */
  retryAfterMs(key: string): number;
  recordFailure(key: string): void;
  reset(key: string): void;
}

/** In-memory limiter: enough for a single API instance (SQLite allows only one writer anyway). */
export function createLoginRateLimiter(
  clock: Clock,
  policy: RateLimitPolicy = DEFAULT_LOGIN_POLICY,
): LoginRateLimiter {
  const failures = new Map<string, number[]>();

  const recent = (key: string): number[] => {
    const since = clock() - policy.windowMs;
    const kept = (failures.get(key) ?? []).filter((time) => time > since);
    if (kept.length === 0) {
      failures.delete(key);
    } else {
      failures.set(key, kept);
    }
    return kept;
  };

  return {
    retryAfterMs(key) {
      const attempts = recent(key);
      const oldest = attempts[0];
      if (attempts.length < policy.maxFailures || oldest === undefined) {
        return 0;
      }
      return oldest + policy.windowMs - clock();
    },
    recordFailure(key) {
      failures.set(key, [...recent(key), clock()]);
    },
    reset(key) {
      failures.delete(key);
    },
  };
}
