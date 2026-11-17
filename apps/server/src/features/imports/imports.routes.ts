import {
  confirmImportRequestSchema,
  importUrlRequestSchema,
  type SongDetail,
  songIdParamSchema,
} from "@open-keys/contracts";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { AppError, type AuthedEnv, validate } from "../../shared/http";
import type { ImportsService } from "./imports.service";

/** Room for the multipart envelope around the file. */
const MULTIPART_OVERHEAD = 64 * 1024;

export function createImportsRoutes(service: ImportsService, maxMidiSize: number) {
  const limit = bodyLimit({
    maxSize: maxMidiSize + MULTIPART_OVERHEAD,
    onError: () => {
      throw new AppError("PAYLOAD_TOO_LARGE", `MIDI files are limited to ${maxMidiSize} bytes`);
    },
  });

  return new Hono<AuthedEnv>()
    .post("/file", limit, async (c) => {
      const form = await c.req.parseBody();
      const file = form["file"];
      if (!(file instanceof File)) {
        throw new AppError("VALIDATION_ERROR", "Invalid form", {
          details: [{ path: "file", message: "A .mid file is required" }],
        });
      }
      const result = await service.importFile(
        c.var.user.id,
        new Uint8Array(await file.arrayBuffer()),
        file.name,
      );
      return c.json<SongDetail>(result.song, result.created ? 201 : 200);
    })
    .post("/url", validate("json", importUrlRequestSchema), async (c) => {
      const result = await service.importUrl(c.var.user.id, c.req.valid("json").url);
      return c.json<SongDetail>(result.song, result.created ? 201 : 200);
    })
    .post(
      "/:id/confirm",
      validate("param", songIdParamSchema),
      validate("json", confirmImportRequestSchema),
      async (c) => {
        const song = await service.confirm(c.var.user.id, c.req.valid("param").id, c.req.valid("json"));
        return c.json<SongDetail>(song);
      },
    );
}
