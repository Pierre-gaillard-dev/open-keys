import { type LibraryEntry, putLibraryEntryRequestSchema, ulidSchema } from "@open-keys/contracts";
import { Hono } from "hono";
import { z } from "zod";
import { type AuthedEnv, validate } from "../../shared/http";
import type { LibraryService } from "./library.service";

const songIdParam = z.object({ songId: ulidSchema });

export function createLibraryRoutes(service: LibraryService) {
  return new Hono<AuthedEnv>()
    .get("/", (c) => c.json<LibraryEntry[]>(service.list(c.var.user.id)))
    .put("/:songId", validate("param", songIdParam), validate("json", putLibraryEntryRequestSchema), (c) =>
      c.json<LibraryEntry>(service.put(c.var.user.id, c.req.valid("param").songId, c.req.valid("json"))),
    );
}
