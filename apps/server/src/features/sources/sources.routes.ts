import { type SongDetail, searchSourcesQuerySchema, sourcePieceParamSchema } from "@open-keys/contracts";
import { Hono } from "hono";
import { type AuthedEnv, validate } from "../../shared/http";
import type { SourcesService } from "./sources.service";

/** /sources (UC-20) */
export function createSourcesRoutes(service: SourcesService) {
  return new Hono<AuthedEnv>()
    .get("/pieces", validate("query", searchSourcesQuerySchema), (c) =>
      c.json(service.search(c.req.valid("query"))),
    )
    .get("/pieces/:id/midi", validate("param", sourcePieceParamSchema), async (c) => {
      const bytes = await service.midi(c.req.valid("param").id);
      return c.body(bytes.slice().buffer, 200, {
        "Content-Type": "audio/midi",
        "Cache-Control": "private, max-age=86400",
      });
    })
    .post("/pieces/:id/import", validate("param", sourcePieceParamSchema), async (c) => {
      const result = await service.importPiece(c.var.user, c.req.valid("param").id);
      return c.json<SongDetail>(result.song, result.created ? 201 : 200);
    });
}
