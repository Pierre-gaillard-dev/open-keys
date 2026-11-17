import { zValidator } from "@hono/zod-validator";
import type { ValidationIssue } from "@open-keys/contracts";
import type { ValidationTargets } from "hono";
import type { z } from "zod";
import { AppError } from "./errors";

interface SchemaIssue {
  readonly path: readonly PropertyKey[];
  readonly message: string;
}

function toIssues(issues: readonly SchemaIssue[]): ValidationIssue[] {
  return issues.map((issue) => ({ path: issue.path.map(String).join("."), message: issue.message }));
}

/**
 * Validates a request part against a zod schema (usually from packages/contracts).
 * Invalid input becomes a VALIDATION_ERROR with one issue per invalid field.
 */
export function validate<Target extends keyof ValidationTargets, Schema extends z.ZodType>(
  target: Target,
  schema: Schema,
) {
  return zValidator(target, schema, (result) => {
    if (!result.success) {
      throw new AppError("VALIDATION_ERROR", `Invalid ${target}`, { details: toIssues(result.error.issues) });
    }
  });
}
