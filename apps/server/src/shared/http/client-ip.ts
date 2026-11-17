import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";

/** Client address, from X-Forwarded-For only when the API sits behind a trusted proxy (Traefik). */
export function clientIp(c: Context, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
    if (forwarded) {
      return forwarded;
    }
  }
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    return "unknown"; // in-process requests (tests) have no socket
  }
}
