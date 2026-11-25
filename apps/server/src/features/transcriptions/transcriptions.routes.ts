import {
  type TranscriptionJob,
  type Transcriptions,
  transcriptionUrlRequestSchema,
  ulidSchema,
} from "@open-keys/contracts";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { AppError, type AuthedEnv, validate } from "../../shared/http";
import type { TranscriptionsService } from "./transcriptions.service";

/** Room for the multipart envelope around the file. */
const MULTIPART_OVERHEAD = 64 * 1024;

const durationSchema = z.coerce
  .number()
  .nonnegative()
  .max(24 * 60 * 60);

/**
 * POST /transcriptions (multipart: file, durationS?) → 201 the queued job;
 * POST /transcriptions/url ({ url, title?, durationS? }, an allowed audio source) → 201;
 * GET /transcriptions → availability and the user's recent jobs; GET /transcriptions/:id.
 */
export function createTranscriptionsRoutes(service: TranscriptionsService, maxAudioSize: number) {
  const limit = bodyLimit({
    maxSize: maxAudioSize + MULTIPART_OVERHEAD,
    onError: () => {
      throw new AppError("PAYLOAD_TOO_LARGE", `Recordings are limited to ${maxAudioSize} bytes`);
    },
  });

  return new Hono<AuthedEnv>()
    .get("/", (c) => c.json<Transcriptions>(service.list(c.var.user)))
    .post("/url", validate("json", transcriptionUrlRequestSchema), async (c) => {
      const { url, title, durationS } = c.req.valid("json");
      const job = await service.submitUrl(c.var.user, url, title ?? null, durationS ?? null);
      return c.json<TranscriptionJob>(job, 201);
    })
    .get("/:id", validate("param", z.object({ id: ulidSchema })), (c) =>
      c.json<TranscriptionJob>(service.get(c.var.user, c.req.valid("param").id)),
    )
    .post("/", limit, async (c) => {
      const form = await c.req.parseBody();
      const file = form["file"];
      if (!(file instanceof File)) {
        throw new AppError("VALIDATION_ERROR", "Invalid form", {
          details: [{ path: "file", message: "Un enregistrement audio est requis" }],
        });
      }
      const duration = durationSchema.safeParse(form["durationS"]);
      const job = await service.submit(
        c.var.user,
        new Uint8Array(await file.arrayBuffer()),
        file.name,
        typeof form["durationS"] === "string" && duration.success ? duration.data : null,
      );
      return c.json<TranscriptionJob>(job, 201);
    });
}
