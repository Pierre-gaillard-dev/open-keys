import { vi } from "vitest";

export interface FakeRequest {
  readonly method: string;
  readonly path: string;
  readonly query: URLSearchParams;
  readonly body: unknown;
}

export type FakeReply = { readonly status?: number; readonly json?: unknown } | undefined;
export type FakeHandler = (request: FakeRequest) => FakeReply;

/**
 * Replaces fetch with an in-memory API: handlers are keyed by "METHOD /api/path"
 * (path without query). Unknown routes answer 404 with the API error format.
 */
export function installFakeApi(handlers: Record<string, FakeHandler>) {
  const requests: FakeRequest[] = [];
  const fetchMock = vi.fn((input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input), "http://localhost");
    const method = init.method ?? "GET";
    const body = typeof init.body === "string" ? JSON.parse(init.body) : init.body;
    const request: FakeRequest = { method, path: url.pathname, query: url.searchParams, body };
    requests.push(request);
    const handler = handlers[`${method} ${url.pathname}`];
    const reply = handler
      ? handler(request)
      : { status: 404, json: { error: { code: "NOT_FOUND", message: "Not found", requestId: "test" } } };
    const status = reply?.status ?? (reply?.json === undefined ? 204 : 200);
    return Promise.resolve(
      reply?.json === undefined ? new Response(null, { status }) : Response.json(reply.json, { status }),
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  return {
    requests,
    /** Requests to a route, in order. */
    calls: (method: string, path: string) => requests.filter((r) => r.method === method && r.path === path),
  };
}

export function apiError(status: number, code: string, message: string, details?: unknown): FakeReply {
  return {
    status,
    json: { error: { code, message, requestId: "req-test", ...(details ? { details } : {}) } },
  };
}
