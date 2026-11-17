import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiError, apiRequest } from "./http-client";

function mockFetch(response: Response | Error) {
  const fetchMock = vi.fn(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiRequest", () => {
  it("prefixes /api, encodes the query and validates the response", async () => {
    const fetchMock = mockFetch(Response.json({ name: "lent", songCount: 2 }));

    const tag = await apiRequest("GET", "/tags", {
      query: { tags: ["a", "b"], q: "", status: undefined, page: 2 },
      schema: z.object({ name: z.string(), songCount: z.number() }),
    });

    expect(tag).toEqual({ name: "lent", songCount: 2 });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tags?tags=a%2Cb&page=2",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("sends JSON bodies with the right content type", async () => {
    const fetchMock = mockFetch(new Response(null, { status: 204 }));

    await apiRequest("PATCH", "/songs/1", { body: { title: "x" } });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/songs/1",
      expect.objectContaining({ body: '{"title":"x"}', headers: { "Content-Type": "application/json" } }),
    );
  });

  it("turns API errors into ApiError with field issues", async () => {
    mockFetch(
      Response.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid json",
            requestId: "r1",
            details: [{ path: "title", message: "Too short" }],
          },
        },
        { status: 400 },
      ),
    );

    const error = await apiRequest("POST", "/imports/url", { body: {} }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, code: "VALIDATION_ERROR", requestId: "r1" });
    expect((error as ApiError).issues).toEqual([{ path: "title", message: "Too short" }]);
  });

  it("reports network failures as an unreachable server", async () => {
    mockFetch(new TypeError("Failed to fetch"));

    await expect(apiRequest("GET", "/songs")).rejects.toMatchObject({ status: 0, code: "INTERNAL_ERROR" });
  });

  it("rejects a response that does not match the contract", async () => {
    mockFetch(Response.json({ unexpected: true }));

    await expect(apiRequest("GET", "/tags", { schema: z.object({ name: z.string() }) })).rejects.toThrow();
  });
});
