import { mutopiaPieceParamSchema, type SongDetail, searchMutopiaQuerySchema } from "@open-keys/contracts";
import { Hono } from "hono";
import { type AuthedEnv, validate } from "../../shared/http";
import type { MutopiaService } from "./mutopia.service";

/** /mutopia (UC-20) */
export function createMutopiaRoutes(service: MutopiaService) {
  return new Hono<AuthedEnv>()
    .get("/pieces", validate("query", searchMutopiaQuerySchema), (c) =>
      c.json(service.search(c.req.valid("query"))),
    )
    .get("/pieces/:id/midi", validate("param", mutopiaPieceParamSchema), async (c) => {
      const bytes = await service.midi(c.req.valid("param").id);
      return c.body(bytes.slice().buffer, 200, {
        "Content-Type": "audio/midi",
        "Cache-Control": "private, max-age=86400",
      });
    })
    .post("/pieces/:id/import", validate("param", mutopiaPieceParamSchema), async (c) => {
      const result = await service.importPiece(c.var.user.id, c.req.valid("param").id);
      return c.json<SongDetail>(result.song, result.created ? 201 : 200);
    });
}
