import { z } from "zod";
import { LOG_LEVELS } from "../shared/logger";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  APP_VERSION: z.string().min(1).default("dev"),
  LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse(source);
}
