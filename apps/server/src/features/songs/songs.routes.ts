import {
  listSongsQuerySchema,
  type SongDetail,
  type SongSummary,
  songIdParamSchema,
  updateSongRequestSchema,
} from "@open-keys/contracts";
import { Hono } from "hono";
import { type AuthedEnv, validate } from "../../shared/http";
import type { SongsService } from "./songs.service";

export function createSongsRoutes(service: SongsService) {
  return new Hono<AuthedEnv>()
    .get("/", validate("query", listSongsQuerySchema), (c) =>
      c.json<SongSummary[]>(service.list(c.var.user.id, c.req.valid("query"))),
    )
    .get("/:id", validate("param", songIdParamSchema), (c) =>
      c.json<SongDetail>(service.detail(c.var.user, c.req.valid("param").id)),
    )
    .patch(
      "/:id",
      validate("param", songIdParamSchema),
      validate("json", updateSongRequestSchema),
      async (c) =>
        c.json<SongDetail>(await service.update(c.var.user, c.req.valid("param").id, c.req.valid("json"))),
    )
    .delete("/:id", validate("param", songIdParamSchema), (c) => {
      service.remove(c.var.user, c.req.valid("param").id);
      return c.body(null, 204);
    })
    .get("/:id/midi", validate("param", songIdParamSchema), async (c) => {
      const { bytes, sha256 } = await service.midiFile(c.req.valid("param").id);
      const etag = `"${sha256}"`;
      // The file of a song never changes: cache forever, revalidate with the hash.
      c.header("ETag", etag);
      c.header("Cache-Control", "private, max-age=31536000, immutable");
      if (c.req.header("If-None-Match") === etag) {
        return c.body(null, 304);
      }
      c.header("Content-Type", "audio/midi");
      return c.body(bytes.slice().buffer);
    });
}
