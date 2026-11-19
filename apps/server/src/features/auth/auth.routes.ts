import {
  type AuthUser,
  changePasswordRequestSchema,
  loginRequestSchema,
  updatePreferencesRequestSchema,
} from "@open-keys/contracts";
import { Hono } from "hono";
import { type AppEnv, clientIp, validate } from "../../shared/http";
import { requireAuth } from "./auth.middleware";
import type { AuthService } from "./auth.service";
import { clearSessionCookie, readSessionToken, writeSessionCookie } from "./session-cookie";

export interface AuthRoutesOptions {
  readonly secureCookie: boolean;
  readonly trustProxy: boolean;
}

export function createAuthRoutes(service: AuthService, { secureCookie, trustProxy }: AuthRoutesOptions) {
  return new Hono<AppEnv>()
    .post("/login", validate("json", loginRequestSchema), async (c) => {
      const { username, password } = c.req.valid("json");
      const session = await service.login({ username, password, clientKey: clientIp(c, trustProxy) });
      writeSessionCookie(c, session.token, session.expiresAt, secureCookie);
      return c.json<AuthUser>(session.user);
    })
    .post("/logout", (c) => {
      const token = readSessionToken(c);
      if (token) {
        service.logout(token);
      }
      clearSessionCookie(c, secureCookie);
      return c.body(null, 204);
    })
    .get("/me", requireAuth(service, secureCookie), (c) => c.json<AuthUser>(c.var.user))
    .put(
      "/password",
      requireAuth(service, secureCookie),
      validate("json", changePasswordRequestSchema),
      async (c) => {
        const { currentPassword, newPassword } = c.req.valid("json");
        await service.changePassword(c.var.user.id, c.var.sessionId, currentPassword, newPassword);
        return c.body(null, 204);
      },
    )
    .put(
      "/preferences",
      requireAuth(service, secureCookie),
      validate("json", updatePreferencesRequestSchema),
      (c) => c.json<AuthUser>(service.updatePreferences(c.var.user.id, c.req.valid("json"))),
    );
}
