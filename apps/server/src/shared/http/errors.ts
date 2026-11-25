import { ERROR_CODES, type ErrorCode } from "@open-keys/contracts";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/** The only place where business error codes become HTTP statuses. */
const STATUS_BY_CODE: Readonly<Record<ErrorCode, ContentfulStatusCode>> = {
  BAD_REQUEST: 400,
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};

export function httpStatusOf(code: ErrorCode): ContentfulStatusCode {
  return STATUS_BY_CODE[code];
}

/** Closest business code for a raw HTTP status (errors thrown by Hono itself). */
export function errorCodeOfStatus(status: number): ErrorCode {
  const match = ERROR_CODES.find((code) => STATUS_BY_CODE[code] === status && code !== "VALIDATION_ERROR");
  if (match) {
    return match;
  }
  return status >= 500 ? "INTERNAL_ERROR" : "BAD_REQUEST";
}

export interface AppErrorOptions {
  readonly details?: unknown;
  readonly cause?: unknown;
  /** Extra response headers (e.g. Retry-After). */
  readonly headers?: Readonly<Record<string, string>>;
}

/** Expected business error: its message is safe to show to the client. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details: unknown;
  readonly headers: Readonly<Record<string, string>>;

  constructor(code: ErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.details = options.details;
    this.headers = options.headers ?? {};
  }

  get status(): ContentfulStatusCode {
    return httpStatusOf(this.code);
  }
}
