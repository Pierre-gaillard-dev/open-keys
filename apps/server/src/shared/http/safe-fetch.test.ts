import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppError } from "./errors";
import { createSafeFetch, type DnsLookup, isPublicAddress } from "./safe-fetch";

let server: Server;
let base: string;

beforeAll(async () => {
  server = createServer((request, response) => {
    switch (request.url) {
      case "/file.mid":
        response.writeHead(200, { "Content-Type": "audio/midi" }).end("MThd-data");
        break;
      case "/redirect":
        response.writeHead(302, { Location: "/file.mid" }).end();
        break;
      case "/loop":
        response.writeHead(302, { Location: "/loop" }).end();
        break;
      case "/to-file-scheme":
        response.writeHead(302, { Location: "file:///etc/passwd" }).end();
        break;
      case "/big-declared":
        response.writeHead(200, { "Content-Length": "5000" }).end("x".repeat(5000));
        break;
      case "/big-streamed":
        response.writeHead(200);
        response.write("x".repeat(3000));
        response.end("x".repeat(3000));
        break;
      case "/slow":
        setTimeout(() => response.writeHead(200).end("late"), 500);
        break;
      default:
        response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

const localFetch = createSafeFetch({ userAgent: "OpenKeys/test", allowPrivateNetworks: true });
const strictFetch = createSafeFetch({ userAgent: "OpenKeys/test" });

async function failure(promise: Promise<unknown>): Promise<AppError> {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  if (!(error instanceof AppError)) {
    throw new Error(`Expected an AppError, got ${String(error)}`);
  }
  return error;
}

describe("isPublicAddress", () => {
  it.each(["93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946"])("accepts %s", (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });

  it.each([
    "127.0.0.1",
    "10.0.0.5",
    "172.16.3.4",
    "192.168.1.10",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "fd00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "not-an-ip",
  ])("rejects %s", (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });
});

describe("createSafeFetch", () => {
  it("downloads a file", async () => {
    const result = await localFetch(`${base}/file.mid`, { maxBytes: 1000 });

    expect(new TextDecoder().decode(result.bytes)).toBe("MThd-data");
    expect(result.contentType).toBe("audio/midi");
  });

  it("follows redirects and reports the final URL", async () => {
    const result = await localFetch(`${base}/redirect`, { maxBytes: 1000 });

    expect(result.finalUrl).toBe(`${base}/file.mid`);
  });

  it("stops after too many redirects", async () => {
    expect((await failure(localFetch(`${base}/loop`, { maxBytes: 1000 }))).message).toBe(
      "Too many redirects",
    );
  });

  it("refuses redirects to non-http schemes", async () => {
    const error = await failure(localFetch(`${base}/to-file-scheme`, { maxBytes: 1000 }));

    expect(error.message).toBe("Only plain http(s) URLs are allowed");
  });

  it("enforces the size limit from the declared length and while streaming", async () => {
    expect((await failure(localFetch(`${base}/big-declared`, { maxBytes: 1000 }))).code).toBe(
      "PAYLOAD_TOO_LARGE",
    );
    expect((await failure(localFetch(`${base}/big-streamed`, { maxBytes: 4000 }))).code).toBe(
      "PAYLOAD_TOO_LARGE",
    );
  });

  it("reports remote errors and timeouts", async () => {
    expect((await failure(localFetch(`${base}/missing`, { maxBytes: 1000 }))).message).toBe(
      "The remote server answered 404",
    );
    expect((await failure(localFetch(`${base}/slow`, { maxBytes: 1000, timeoutMs: 100 }))).message).toBe(
      "The remote server did not answer in time",
    );
  });

  it.each(["ftp://example.org/a.mid", "file:///etc/passwd", "http://user:pass@example.org/"])(
    "rejects %s",
    async (url) => {
      expect((await failure(strictFetch(url, { maxBytes: 1000 }))).code).toBe("BAD_REQUEST");
    },
  );

  it("blocks loopback and private IP literals by default", async () => {
    for (const url of [`${base}/file.mid`, "http://[::1]/", "http://169.254.169.254/latest/meta-data"]) {
      expect((await failure(strictFetch(url, { maxBytes: 1000 }))).message).toBe(
        "URL points to a private or local network",
      );
    }
  });

  it("blocks host names that resolve to a private address (checked at connection time)", async () => {
    const rebinding: DnsLookup = (_hostname, _options, callback) =>
      callback(null, [{ address: "10.0.0.7", family: 4 }]);
    const fetchWithFakeDns = createSafeFetch({ userAgent: "OpenKeys/test", lookup: rebinding });

    const error = await failure(fetchWithFakeDns("http://innocent.example/file.mid", { maxBytes: 1000 }));

    expect(error.message).toBe("URL points to a private or local network");
  });
});
