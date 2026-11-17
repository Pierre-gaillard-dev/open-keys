import { createMiddleware } from "hono/factory";
import type { Logger, LogLevel } from "../logger";
import type { AppEnv } from "./app-env";

/** Paths polled by infrastructure (Dokploy healthcheck): logged at debug level only. */
const QUIET_PATHS: ReadonlySet<string> = new Set(["/api/health"]);

function levelFor(path: string, status: number): LogLevel {
  if (status >= 500) {
    return "error";
  }
  if (status >= 400) {
    return "warn";
  }
  return QUIET_PATHS.has(path) ? "debug" : "info";
}

/** Binds a request-scoped logger (with the request id) and writes one access log per request. */
export function requestLogger(logger: Logger) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const startedAt = performance.now();
    const requestLog = logger.child({ requestId: c.var.requestId });
    c.set("logger", requestLog);

    await next();

    const status = c.res.status;
    const durationMs = Math.round((performance.now() - startedAt) * 10) / 10;
    requestLog[levelFor(c.req.path, status)]("request", {
      method: c.req.method,
      path: c.req.path,
      status,
      durationMs,
    });
  });
}
