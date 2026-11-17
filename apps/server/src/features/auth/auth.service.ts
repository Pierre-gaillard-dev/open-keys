import { createHash, randomBytes } from "node:crypto";
import type { AuthUser } from "@open-keys/contracts";
import type { Database } from "../../db";
import { AppError } from "../../shared/http";
import type { Logger } from "../../shared/logger";
import type { Clock, IdGenerator } from "../../shared/runtime";
import {
  countUsers,
  deleteExpiredSessions,
  deleteSessionByTokenHash,
  findActiveSession,
  findUserByUsername,
  insertSession,
  insertUser,
  updateSessionExpiry,
} from "./auth.queries";
import type { LoginRateLimiter } from "./login-rate-limiter";
import type { PasswordHasher } from "./password-hasher";

const DAY_MS = 24 * 60 * 60_000;
/** Sliding expiration: 90 days after the last use. */
export const SESSION_TTL_MS = 90 * DAY_MS;
/** The expiry is pushed back at most once a day (avoids a write per request). */
const REFRESH_AFTER_MS = DAY_MS;

export interface AuthServiceDeps {
  readonly db: Database;
  readonly clock: Clock;
  readonly newId: IdGenerator;
  readonly hasher: PasswordHasher;
  readonly rateLimiter: LoginRateLimiter;
  readonly logger: Logger;
}

export interface LoginInput {
  readonly username: string;
  readonly password: string;
  /** Who is trying (client IP): rate limiting is per client and username. */
  readonly clientKey: string;
}

export interface OpenedSession {
  readonly token: string;
  readonly expiresAt: number;
  readonly user: AuthUser;
}

export interface AuthenticatedSession {
  readonly user: AuthUser;
  readonly expiresAt: number;
  /** True when the expiry was pushed back: the cookie must be re-issued. */
  readonly refreshed: boolean;
}

export type AuthService = ReturnType<typeof createAuthService>;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createAuthService({ db, clock, newId, hasher, rateLimiter, logger }: AuthServiceDeps) {
  /** Compared against when the user does not exist, so timing does not reveal valid usernames. */
  let dummyHash: Promise<string> | undefined;
  const fallbackHash = () => {
    dummyHash ??= hasher.hash(randomBytes(16).toString("hex"));
    return dummyHash;
  };

  return {
    async login({ username, password, clientKey }: LoginInput): Promise<OpenedSession> {
      const limiterKey = `${clientKey}|${username.toLowerCase()}`;
      const retryAfterMs = rateLimiter.retryAfterMs(limiterKey);
      if (retryAfterMs > 0) {
        const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);
        throw new AppError("RATE_LIMITED", "Too many failed attempts, try again later", {
          details: { retryAfterSeconds },
          headers: { "Retry-After": String(retryAfterSeconds) },
        });
      }

      const user = findUserByUsername(db, username);
      const valid = await hasher.verify(password, user?.passwordHash ?? (await fallbackHash()));
      if (!(user && valid)) {
        rateLimiter.recordFailure(limiterKey);
        logger.warn("Failed login", { username });
        throw new AppError("UNAUTHORIZED", "Invalid username or password");
      }

      rateLimiter.reset(limiterKey);
      const now = clock();
      const token = randomBytes(32).toString("base64url");
      const expiresAt = now + SESSION_TTL_MS;
      insertSession(db, {
        id: newId(),
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt,
        createdAt: now,
      });
      logger.info("Login", { userId: user.id });
      return { token, expiresAt, user: { id: user.id, username: user.username } };
    },

    authenticate(token: string): AuthenticatedSession | undefined {
      const now = clock();
      const session = findActiveSession(db, hashToken(token), now);
      if (!session) {
        return undefined;
      }
      const user = { id: session.userId, username: session.username };
      if (now + SESSION_TTL_MS - session.expiresAt < REFRESH_AFTER_MS) {
        return { user, expiresAt: session.expiresAt, refreshed: false };
      }
      const expiresAt = now + SESSION_TTL_MS;
      updateSessionExpiry(db, session.sessionId, expiresAt);
      return { user, expiresAt, refreshed: true };
    },

    logout(token: string): void {
      deleteSessionByTokenHash(db, hashToken(token));
    },

    /** Creates the initial account when the database has no user yet. Returns true when created. */
    async ensureInitialUser(username: string, password: string): Promise<boolean> {
      if (countUsers(db) > 0) {
        return false;
      }
      const now = clock();
      insertUser(db, {
        id: newId(),
        username,
        passwordHash: await hasher.hash(password),
        createdAt: now,
        updatedAt: now,
      });
      logger.info("Initial user created", { username });
      return true;
    },

    hasUsers(): boolean {
      return countUsers(db) > 0;
    },

    purgeExpiredSessions(): number {
      return deleteExpiredSessions(db, clock());
    },
  };
}
