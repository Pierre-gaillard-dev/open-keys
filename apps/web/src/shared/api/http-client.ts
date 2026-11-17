import { type ErrorCode, errorResponseSchema, type ValidationIssue } from "@open-keys/contracts";
import type { z } from "zod";
import { reportNetworkFailure, reportNetworkSuccess } from "../offline/connectivity";

/** Error returned by the API (or a network failure, with code INTERNAL_ERROR and status 0). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details: unknown;
  readonly requestId: string | undefined;

  constructor(status: number, code: ErrorCode, message: string, details?: unknown, requestId?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }

  /** Field errors of a VALIDATION_ERROR, empty otherwise. */
  get issues(): ValidationIssue[] {
    return Array.isArray(this.details)
      ? this.details.filter(
          (issue): issue is ValidationIssue =>
            typeof issue === "object" && issue !== null && "path" in issue && "message" in issue,
        )
      : [];
  }
}

export type QueryParams = Readonly<Record<string, string | number | boolean | readonly string[] | undefined>>;

export interface RequestOptions<Schema extends z.ZodType | undefined> {
  readonly query?: QueryParams;
  /** JSON body, or FormData for uploads. */
  readonly body?: unknown;
  /** Expected response; omit for 204 responses. */
  readonly schema?: Schema;
  readonly signal?: AbortSignal;
}

type Result<Schema> = Schema extends z.ZodType ? z.infer<Schema> : undefined;

function buildUrl(path: string, query: QueryParams = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) {
      continue;
    }
    params.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }
  const search = params.toString();
  return `/api${path}${search ? `?${search}` : ""}`;
}

async function toApiError(response: Response): Promise<ApiError> {
  const parsed = errorResponseSchema.safeParse(await response.json().catch(() => undefined));
  if (parsed.success) {
    const { code, message, details, requestId } = parsed.data.error;
    return new ApiError(response.status, code, message, details, requestId);
  }
  return new ApiError(response.status, "INTERNAL_ERROR", `Unexpected response (${response.status})`);
}

/** True when the request never reached the server (offline, DNS, connection refused). */
export function isNetworkError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 0;
}

function networkError(cause: unknown): unknown {
  if (cause instanceof DOMException && cause.name === "AbortError") {
    return cause;
  }
  reportNetworkFailure();
  return new ApiError(0, "INTERNAL_ERROR", "The server cannot be reached. Check your connection.");
}

/** Binary file served by the API (MIDI), at the path given by the API itself. */
export async function apiBytes(url: string): Promise<Uint8Array> {
  let response: Response;
  try {
    response = await fetch(url, { credentials: "same-origin" });
  } catch (cause) {
    throw networkError(cause);
  }
  reportNetworkSuccess();
  if (!response.ok) {
    throw await toApiError(response);
  }
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Typed access to the API: same origin (/api, cookies sent automatically), responses validated
 * against the zod contracts shared with the server.
 */
export async function apiRequest<Schema extends z.ZodType | undefined = undefined>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  options: RequestOptions<Schema> = {},
): Promise<Result<Schema>> {
  const { body, query, schema, signal } = options;
  const isForm = body instanceof FormData;
  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      credentials: "same-origin",
      headers: body === undefined || isForm ? {} : { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: isForm ? body : JSON.stringify(body) }),
      ...(signal ? { signal } : {}),
    });
  } catch (cause) {
    throw networkError(cause);
  }
  reportNetworkSuccess();
  if (!response.ok) {
    throw await toApiError(response);
  }
  if (!schema) {
    return undefined as Result<Schema>; // no body expected (204)
  }
  return schema.parse(await response.json()) as Result<Schema>;
}
