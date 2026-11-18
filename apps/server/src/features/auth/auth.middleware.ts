import { createMiddleware } from "hono/factory";
import { AppError, type AuthedEnv } from "../../shared/http";
import type { AuthService } from "./auth.service";
import { clearSessionCookie, readSessionToken, writeSessionCookie } from "./session-cookie";

/** Rejects requests without a valid session cookie; exposes the user as c.var.user. */
export function requireAuth(service: AuthService, secureCookie: boolean) {
  return createMiddleware<AuthedEnv>(async (c, next) => {
    const token = readSessionToken(c);
    const session = token ? service.authenticate(token) : undefined;
    if (!session) {
      if (token) {
        clearSessionCookie(c, secureCookie);
      }
      throw new AppError("UNAUTHORIZED", "Authentication required");
    }
    if (session.refreshed && token) {
      writeSessionCookie(c, token, session.expiresAt, secureCookie);
    }
    c.set("user", session.user);
    c.set("sessionId", session.sessionId);
    c.set("logger", c.var.logger.child({ userId: session.user.id }));
    await next();
  });
}

/** After requireAuth: only an admin goes through (D29). */
export const requireAdmin = createMiddleware<AuthedEnv>(async (c, next) => {
  if (c.var.user.role !== "admin") {
    throw new AppError("FORBIDDEN", "Reserved to the administrator");
  }
  await next();
});
