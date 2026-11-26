import { createHash, randomBytes } from "node:crypto";
import type { AuthUser, UpdatePreferencesRequest, UserAccount } from "@open-keys/contracts";
import type { Database } from "../../db";
import { AppError } from "../../shared/http";
import type { Logger } from "../../shared/logger";
import type { Clock, IdGenerator } from "../../shared/runtime";
import {
  countUsers,
  deleteExpiredSessions,
  deleteSessionByTokenHash,
  deleteSessionsOfUser,
  findActiveSession,
  findUserById,
  findUserByUsername,
  insertSession,
  insertUser,
  listUsers,
  type UserRow,
  updateSessionExpiry,
  updateUser,
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
  readonly sessionId: string;
  readonly user: AuthUser;
  readonly expiresAt: number;
  /** True when the expiry was pushed back: the cookie must be re-issued. */
  readonly refreshed: boolean;
}

export type AuthService = ReturnType<typeof createAuthService>;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const toAuthUser = (user: Pick<UserRow, "id" | "username" | "role" | "noteNaming">): AuthUser => ({
  id: user.id,
  username: user.username,
  role: user.role,
  noteNaming: user.noteNaming,
});

const toAccount = (user: UserRow): UserAccount => ({
  id: user.id,
  username: user.username,
  role: user.role,
  createdAt: user.createdAt,
  disabled: user.disabledAt !== null,
});

export function createAuthService({ db, clock, newId, hasher, rateLimiter, logger }: AuthServiceDeps) {
  /** Compared against when the user does not exist, so timing does not reveal valid usernames. */
  let dummyHash: Promise<string> | undefined;
  const fallbackHash = () => {
    dummyHash ??= hasher.hash(randomBytes(16).toString("hex"));
    return dummyHash;
  };

  const openSession = (user: UserRow): OpenedSession => {
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
    return { token, expiresAt, user: toAuthUser(user) };
  };

  const requireUser = (id: string): UserRow => {
    const user = findUserById(db, id);
    if (!user) {
      throw new AppError("NOT_FOUND", "Account not found");
    }
    return user;
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
      // A disabled account gets the same answer as a wrong password.
      if (!(user && valid && user.disabledAt === null)) {
        rateLimiter.recordFailure(limiterKey);
        logger.warn("Failed login", { username });
        throw new AppError("UNAUTHORIZED", "Invalid username or password");
      }

      rateLimiter.reset(limiterKey);
      logger.info("Login", { userId: user.id });
      return openSession(user);
    },

    authenticate(token: string): AuthenticatedSession | undefined {
      const now = clock();
      const session = findActiveSession(db, hashToken(token), now);
      if (!session) {
        return undefined;
      }
      const user = toAuthUser({ ...session, id: session.userId });
      const { sessionId } = session;
      if (now + SESSION_TTL_MS - session.expiresAt < REFRESH_AFTER_MS) {
        return { sessionId, user, expiresAt: session.expiresAt, refreshed: false };
      }
      const expiresAt = now + SESSION_TTL_MS;
      updateSessionExpiry(db, sessionId, expiresAt);
      return { sessionId, user, expiresAt, refreshed: true };
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
        role: "admin",
        createdAt: now,
        updatedAt: now,
      });
      logger.info("Initial user created", { username });
      return true;
    },

    /** UC-36: the other sessions of the account are closed, the current one stays open. */
    async changePassword(
      userId: string,
      sessionId: string,
      currentPassword: string,
      newPassword: string,
    ): Promise<void> {
      const user = requireUser(userId);
      if (!(await hasher.verify(currentPassword, user.passwordHash))) {
        throw new AppError("VALIDATION_ERROR", "Current password is wrong", {
          details: [{ path: "currentPassword", message: "Mot de passe actuel incorrect" }],
        });
      }
      updateUser(db, userId, { passwordHash: await hasher.hash(newPassword), updatedAt: clock() });
      deleteSessionsOfUser(db, userId, sessionId);
      logger.info("Password changed", { userId });
    },

    /** Settings of the account (note names), the same on every device. */
    updatePreferences(userId: string, preferences: UpdatePreferencesRequest): AuthUser {
      const user = requireUser(userId);
      updateUser(db, userId, { noteNaming: preferences.noteNaming, updatedAt: clock() });
      return toAuthUser({ ...user, ...preferences });
    },

    /** The user `id` as a session would see it, for work done on their behalf later (transcriptions). */
    findAuthUser(id: string): AuthUser | undefined {
      const user = findUserById(db, id);
      return user && user.disabledAt === null ? toAuthUser(user) : undefined;
    },

    // ── Used by the accounts feature (D29) ──

    listAccounts(): UserAccount[] {
      return listUsers(db).map(toAccount);
    },

    findAccount(id: string): UserAccount | undefined {
      const user = findUserById(db, id);
      return user && toAccount(user);
    },

    /** A disabled account is logged out everywhere; its data and imports stay. */
    setDisabled(actorId: string, userId: string, disabled: boolean): UserAccount {
      const user = requireUser(userId);
      if (userId === actorId) {
        throw new AppError("CONFLICT", "You cannot disable your own account");
      }
      updateUser(db, userId, { disabledAt: disabled ? clock() : null, updatedAt: clock() });
      if (disabled) {
        deleteSessionsOfUser(db, userId);
      }
      logger.info(disabled ? "Account disabled" : "Account enabled", { userId });
      return toAccount({ ...user, disabledAt: disabled ? clock() : null });
    },

    isUsernameTaken(username: string): boolean {
      return findUserByUsername(db, username) !== undefined;
    },

    /** Creates a member account and opens its first session. */
    async createAccount(username: string, password: string): Promise<OpenedSession> {
      if (findUserByUsername(db, username)) {
        throw new AppError("CONFLICT", "This username is taken", {
          details: [{ path: "username", message: "Cet identifiant est déjà pris" }],
        });
      }
      const now = clock();
      const user: UserRow = {
        id: newId(),
        username,
        passwordHash: await hasher.hash(password),
        role: "member",
        disabledAt: null,
        noteNaming: "english",
        createdAt: now,
        updatedAt: now,
      };
      insertUser(db, user);
      logger.info("Account created", { userId: user.id });
      return openSession(user);
    },

    /** Forgotten password: every session is closed, then a new one is opened. */
    async resetPassword(userId: string, password: string): Promise<OpenedSession> {
      const user = requireUser(userId);
      const passwordHash = await hasher.hash(password);
      updateUser(db, userId, { passwordHash, updatedAt: clock() });
      deleteSessionsOfUser(db, userId);
      logger.info("Password reset", { userId });
      return openSession({ ...user, passwordHash });
    },

    hasUsers(): boolean {
      return countUsers(db) > 0;
    },

    purgeExpiredSessions(): number {
      return deleteExpiredSessions(db, clock());
    },
  };
}
