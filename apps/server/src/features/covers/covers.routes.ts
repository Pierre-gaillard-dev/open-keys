import {
  type CoverSuggestion,
  coverSuggestionsQuerySchema,
  setCoverRequestSchema,
  songIdParamSchema,
} from "@open-keys/contracts";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { AppError, type AuthedEnv, validate } from "../../shared/http";
import type { CoversService } from "./covers.service";

const MULTIPART_OVERHEAD = 64 * 1024;

function invalidCoverBody(): AppError {
  return new AppError("VALIDATION_ERROR", "Invalid cover", {
    details: [
      { path: "body", message: "Send an image file (multipart 'file'), { url } or { suggestionId }" },
    ],
  });
}

/** Mounted under /songs: /songs/:id/cover and /songs/:id/cover-suggestions. */
export function createCoversRoutes(service: CoversService, maxCoverSize: number) {
  const limit = bodyLimit({
    maxSize: maxCoverSize + MULTIPART_OVERHEAD,
    onError: () => {
      throw new AppError("PAYLOAD_TOO_LARGE", `Images are limited to ${maxCoverSize} bytes`);
    },
  });

  return new Hono<AuthedEnv>()
    .get("/:id/cover", validate("param", songIdParamSchema), async (c) => {
      const { bytes, sha256 } = await service.read(c.req.valid("param").id);
      const etag = `"${sha256}"`;
      c.header("ETag", etag);
      // The URL carries the hash (?v=…): a new cover means a new URL.
      c.header("Cache-Control", "private, max-age=31536000, immutable");
      if (c.req.header("If-None-Match") === etag) {
        return c.body(null, 304);
      }
      c.header("Content-Type", "image/webp");
      return c.body(bytes.slice().buffer);
    })
    .get(
      "/:id/cover-suggestions",
      validate("param", songIdParamSchema),
      validate("query", coverSuggestionsQuerySchema),
      async (c) => c.json<CoverSuggestion[]>(await service.suggest(c.req.valid("query"))),
    )
    .put("/:id/cover", validate("param", songIdParamSchema), limit, async (c) => {
      const songId = c.req.valid("param").id;
      if ((c.req.header("content-type") ?? "").startsWith("multipart/form-data")) {
        const file = (await c.req.parseBody())["file"];
        if (!(file instanceof File)) {
          throw invalidCoverBody();
        }
        await service.setFromUpload(c.var.user, songId, new Uint8Array(await file.arrayBuffer()));
        return c.body(null, 204);
      }
      const parsed = setCoverRequestSchema.safeParse(await c.req.json().catch(() => undefined));
      if (!parsed.success) {
        throw invalidCoverBody();
      }
      if ("url" in parsed.data) {
        await service.setFromUrl(c.var.user, songId, parsed.data.url);
      } else {
        await service.applySuggestion(c.var.user, songId, parsed.data.suggestionId);
      }
      return c.body(null, 204);
    })
    .delete("/:id/cover", validate("param", songIdParamSchema), (c) => {
      service.remove(c.var.user, c.req.valid("param").id);
      return c.body(null, 204);
    });
}
