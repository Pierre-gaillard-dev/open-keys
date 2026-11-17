import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

const COOKIE_NAME = "open_keys_session";

export function readSessionToken(c: Context): string | undefined {
  return getCookie(c, COOKIE_NAME);
}

export function writeSessionCookie(c: Context, token: string, expiresAt: number, secure: boolean): void {
  setCookie(c, COOKIE_NAME, token, {
    httpOnly: true,
    secure,
    sameSite: "Lax",
    path: "/",
    expires: new Date(expiresAt),
  });
}

export function clearSessionCookie(c: Context, secure: boolean): void {
  deleteCookie(c, COOKIE_NAME, { path: "/", secure });
}
