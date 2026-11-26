import { createHash, timingSafeEqual } from "node:crypto";
import { type TranscriptionJob, transcriptionUrlRequestSchema, ulidSchema } from "@open-keys/contracts";
import { Hono } from "hono";
import { z } from "zod";
import { type AppEnv, AppError, validate } from "../../shared/http";
import type { AuthService } from "../auth";
import type { TranscriptionsService } from "./transcriptions.service";

export interface IntegrationRoutesDeps {
  readonly transcriptions: TranscriptionsService;
  readonly auth: AuthService;
  /** INTEGRATION_TOKEN: the key of the other app. */
  readonly token: string;
  /** INTEGRATION_USERNAME: the account its recordings are imported for. */
  readonly username: string;
  /** PUBLIC_URL, for the link to the review screen. */
  readonly publicUrl: string | undefined;
}

/** A job, with the link to review its draft in Open Keys once transcribed. */
interface IntegrationJob {
  readonly job: TranscriptionJob;
  readonly reviewUrl: string | null;
}

const digest = (value: string) => createHash("sha256").update(value).digest();

/**
 * For the app that fetches the recordings (D35), with `Authorization: Bearer <INTEGRATION_TOKEN>`:
 * POST /integrations/transcriptions ({ url, title?, durationS? }) → 201 { job, reviewUrl };
 * GET /integrations/transcriptions/:id → { job, reviewUrl }. The song keeps the URL of the recording.
 */
export function createIntegrationRoutes({
  transcriptions,
  auth,
  token,
  username,
  publicUrl,
}: IntegrationRoutesDeps) {
  const expected = digest(token);
  const reviewUrlOf = (job: TranscriptionJob) =>
    job.songId && publicUrl ? new URL(`/import/${job.songId}`, publicUrl).toString() : null;
  const account = () => {
    const user = auth.findAuthUserByUsername(username);
    if (!user) {
      throw new AppError("SERVICE_UNAVAILABLE", "The integration account does not exist or is disabled");
    }
    return user;
  };

  return new Hono<AppEnv>()
    .use(async (c, next) => {
      const header = c.req.header("Authorization") ?? "";
      const given = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
      // Hashes of equal length: the comparison takes the same time whatever the key sent.
      if (!timingSafeEqual(digest(given), expected)) {
        throw new AppError("UNAUTHORIZED", "Invalid integration key");
      }
      await next();
    })
    .post("/transcriptions", validate("json", transcriptionUrlRequestSchema), async (c) => {
      const { url, title, durationS } = c.req.valid("json");
      const job = await transcriptions.submitUrl(account(), url, title ?? null, durationS ?? null);
      return c.json<IntegrationJob>({ job, reviewUrl: reviewUrlOf(job) }, 201);
    })
    .get("/transcriptions/:id", validate("param", z.object({ id: ulidSchema })), (c) => {
      const job = transcriptions.get(account(), c.req.valid("param").id);
      return c.json<IntegrationJob>({ job, reviewUrl: reviewUrlOf(job) });
    });
}
