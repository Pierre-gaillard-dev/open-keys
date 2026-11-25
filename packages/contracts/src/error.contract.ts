import { z } from "zod";

/** Business error codes returned by the API. The HTTP status is derived from the code (apps/server). */
export const ERROR_CODES = [
  "BAD_REQUEST",
  "VALIDATION_ERROR",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "PAYLOAD_TOO_LARGE",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
  /** A feature the server is not set up for (the transcriber, D34). */
  "SERVICE_UNAVAILABLE",
] as const;

export const errorCodeSchema = z.enum(ERROR_CODES);

export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const validationIssueSchema = z.object({
  path: z.string(),
  message: z.string(),
});

export type ValidationIssue = z.infer<typeof validationIssueSchema>;

/** Body of every non-2xx API response. */
export const errorResponseSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
    requestId: z.string(),
    details: z.unknown().optional(),
  }),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
