import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../app";
import { loadEnv } from "../config/env";
import { openDatabase } from "../db";
import { createPasswordHasher, type RateLimitPolicy } from "../features/auth";
import { insertUser } from "../features/auth/auth.queries";
import type { CoverProvider } from "../features/covers";
import { createMutopiaProvider, type PageGet } from "../features/sources";
import { createServices, type Infrastructure } from "../services";
import { AppError, type SafeFetch } from "../shared/http";
import { createIdGenerator } from "../shared/runtime";
import { createFileStorage } from "../shared/storage";
import { createMemoryLogger } from "./memory-logger";

export const TEST_ORIGIN = "http://localhost:5173";
export const TEST_PASSWORD = "correct horse battery";

export interface TestServerOptions {
  readonly env?: NodeJS.ProcessEnv;
  /** Fake internet for imports by URL and covers: URL → body. */
  readonly remoteFiles?: Readonly<Record<string, Uint8Array>>;
  readonly coverProviders?: readonly CoverProvider[];
  readonly loginPolicy?: RateLimitPolicy;
  /** Fake Mutopia listing, page by page (startat 0, 10, 20…). Read at each request: tests may change it. */
  readonly mutopiaPages?: readonly string[];
  /** Other online libraries (replaces the fake Mutopia). */
  readonly sourceProviders?: Infrastructure["sourceProviders"];
  /** The transcriber (D34): none by default, as on a server without TRANSCRIBER_URL. */
  readonly transcriber?: Infrastructure["transcriber"];
}

/** Mutopia listing pages served from memory, by their `startat` parameter. */
function fakeMutopia(pages: readonly string[]): PageGet {
  return (url) => {
    const page = pages[Number(new URL(url).searchParams.get("startat") ?? 0) / 10];
    return Promise.resolve(
      page === undefined ? new Response("Not found", { status: 404 }) : new Response(page),
    );
  };
}

/** A complete API wired like production, with in-memory SQLite, a temp data dir and a controllable clock. */
export async function createTestServer(options: TestServerOptions = {}) {
  const env = loadEnv({ NODE_ENV: "test", ...options.env });
  const { logger, entries } = createMemoryLogger();
  // Starts at the real time: file timestamps (storage) come from the real clock.
  let now = Date.now();
  const clock = () => now;
  const database = openDatabase(":memory:");
  const dataDir = await mkdtemp(join(tmpdir(), "open-keys-test-"));
  const storage = await createFileStorage(dataDir);
  const remote = new Map(Object.entries(options.remoteFiles ?? {}));
  const fetchedUrls: string[] = [];
  const safeFetch: SafeFetch = (url, fetchOptions) => {
    fetchedUrls.push(url);
    const body = remote.get(url);
    if (!body) {
      return Promise.reject(new AppError("BAD_REQUEST", "The remote server answered 404"));
    }
    if (body.byteLength > fetchOptions.maxBytes) {
      return Promise.reject(new AppError("PAYLOAD_TOO_LARGE", "Remote file is too large"));
    }
    return Promise.resolve({ bytes: body, contentType: null, finalUrl: url });
  };
  const hasher = createPasswordHasher({ memory: 1024, passes: 1, parallelism: 1 });
  const newId = createIdGenerator(clock);
  const services = createServices({
    env,
    logger,
    db: database.db,
    storage,
    clock,
    newId,
    safeFetch,
    hasher,
    coverProviders: options.coverProviders ?? [],
    sourceProviders:
      options.sourceProviders ??
      (({ download }) => [
        createMutopiaProvider({ get: fakeMutopia(options.mutopiaPages ?? []), download, pageDelayMs: 0 }),
      ]),
    ...(options.loginPolicy ? { loginPolicy: options.loginPolicy } : {}),
    transcriber: options.transcriber ?? null,
  });
  // The relay of recordings (D35) reads the same fake internet, with byte ranges.
  const audioFetch = ((input: string | URL | Request, init?: RequestInit) => {
    const body = remote.get(String(input));
    if (!body) {
      return Promise.resolve(new Response(null, { status: 404 }));
    }
    const range = /bytes=(\d+)-(\d*)/.exec(new Headers(init?.headers).get("Range") ?? "");
    if (!range) {
      return Promise.resolve(
        new Response(body.slice().buffer, {
          headers: { "Content-Type": "audio/ogg", "Accept-Ranges": "bytes" },
        }),
      );
    }
    const start = Number(range[1]);
    const end = range[2] ? Number(range[2]) : body.byteLength - 1;
    return Promise.resolve(
      new Response(body.slice(start, end + 1).buffer, {
        status: 206,
        headers: { "Content-Type": "audio/ogg", "Content-Range": `bytes ${start}-${end}/${body.byteLength}` },
      }),
    );
  }) as typeof fetch;
  const app = createApp({ env, logger, services, audioFetch });

  let cookie = "";
  const request = (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    if (cookie && !headers.has("Cookie")) {
      headers.set("Cookie", cookie);
    }
    if (!headers.has("Origin")) {
      headers.set("Origin", TEST_ORIGIN);
    }
    return app.request(path, { ...init, headers });
  };
  const json = (method: string, path: string, body?: unknown) =>
    request(path, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

  return {
    app,
    services,
    storage,
    dataDir,
    logs: entries,
    fetchedUrls,
    request,
    json,
    /** Creates the account if needed, logs in and keeps the session cookie for next requests. */
    async login(username = "pierre", password = TEST_PASSWORD) {
      if (!services.auth.hasUsers()) {
        await services.auth.ensureInitialUser(username, password);
      }
      const response = await json("POST", "/api/auth/login", { username, password });
      cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
      return response;
    },
    forgetSession() {
      cookie = "";
    },
    /** Extra account (the API has no sign-up). */
    async addUser(username: string, password = TEST_PASSWORD) {
      insertUser(database.db, {
        id: newId(),
        username,
        passwordHash: await hasher.hash(password),
        createdAt: now,
        updatedAt: now,
      });
    },
    upload(path: string, bytes: Uint8Array, filename: string, type = "application/octet-stream") {
      const form = new FormData();
      form.append("file", new File([bytes.slice().buffer], filename, { type }));
      return request(path, { method: "POST", body: form });
    },
    uploadWith(method: string, path: string, bytes: Uint8Array, filename: string) {
      const form = new FormData();
      form.append("file", new File([bytes.slice().buffer], filename));
      return request(path, { method, body: form });
    },
    advance(ms: number) {
      now += ms;
    },
    now: () => now,
    close: () => database.close(),
  };
}

export type TestServer = Awaited<ReturnType<typeof createTestServer>>;
