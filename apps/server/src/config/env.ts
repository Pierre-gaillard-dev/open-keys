import { z } from "zod";
import { LOG_LEVELS } from "../shared/logger";

const booleanString = z.enum(["true", "false"]).transform((value) => value === "true");

const DEFAULT_DEV_ORIGIN = "http://localhost:5173";
const PROJECT_URL = "https://github.com/Pierre-gaillard-dev/open-keys";

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    APP_VERSION: z.string().min(1).default("dev"),
    LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
    /** SQLite database, MIDI files and covers. */
    DATA_DIR: z.string().min(1).default("./data"),
    /** Public origin of the app (https://keys.example.org): only origin allowed for state-changing requests. */
    PUBLIC_URL: z.url({ protocol: /^https?$/ }).optional(),
    /** Initial account, created at startup when no user exists. */
    ADMIN_USERNAME: z.string().trim().min(1).max(64).optional(),
    ADMIN_PASSWORD: z.string().min(12).max(256).optional(),
    /** Secure cookies (HTTPS only). Disable only for local HTTP. */
    COOKIE_SECURE: booleanString.optional(),
    /** Trust X-Forwarded-For (set when behind Traefik). */
    TRUST_PROXY: booleanString.default(false),
    MAX_MIDI_SIZE: z.coerce
      .number()
      .int()
      .positive()
      .default(2 * 1024 * 1024),
    MAX_COVER_SIZE: z.coerce
      .number()
      .int()
      .positive()
      .default(10 * 1024 * 1024),
    /** Contact advertised in the User-Agent sent to MusicBrainz and Wikimedia (their API policies require one). */
    MUSICBRAINZ_CONTACT: z.string().min(1).default(PROJECT_URL),
    /** Transcriber service (D34) on the Docker network (http://transcriber:8000); unset: no audio import. */
    TRANSCRIBER_URL: z.url({ protocol: /^https?$/ }).optional(),
    MAX_AUDIO_SIZE: z.coerce
      .number()
      .int()
      .positive()
      .default(40 * 1024 * 1024),
    /**
     * Origins whose recordings may be transcribed and played back (D35), comma-separated: the app that
     * fetches the recordings (https://music.example.org). Only these URLs are ever downloaded.
     */
    AUDIO_SOURCES: z
      .string()
      .default("")
      .transform((value, context) => {
        const origins: string[] = [];
        for (const entry of value
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean)) {
          const parsed = z.url({ protocol: /^https?$/ }).safeParse(entry);
          if (!parsed.success) {
            context.addIssue({ code: "custom", message: `Invalid origin: ${entry}` });
            return z.NEVER;
          }
          origins.push(new URL(parsed.data).origin);
        }
        return origins;
      }),
    /** Key of the other app sending recordings (Authorization: Bearer …), 32 characters at least (D35). */
    INTEGRATION_TOKEN: z.string().min(32).optional(),
    /** Account the recordings sent by the other app are imported for. */
    INTEGRATION_USERNAME: z.string().trim().min(1).optional(),
    /** Synchronisation of the online libraries (disabled by the end-to-end tests: no crawling in CI). */
    SOURCES_SYNC: booleanString.default(true),
  })
  .refine((env) => (env.ADMIN_USERNAME === undefined) === (env.ADMIN_PASSWORD === undefined), {
    message: "ADMIN_USERNAME and ADMIN_PASSWORD must be set together",
    path: ["ADMIN_PASSWORD"],
  })
  .refine((env) => (env.INTEGRATION_TOKEN === undefined) === (env.INTEGRATION_USERNAME === undefined), {
    message: "INTEGRATION_TOKEN and INTEGRATION_USERNAME must be set together",
    path: ["INTEGRATION_USERNAME"],
  })
  .refine((env) => env.NODE_ENV !== "production" || env.PUBLIC_URL !== undefined, {
    message: "PUBLIC_URL is required in production",
    path: ["PUBLIC_URL"],
  })
  .transform((env) => ({
    ...env,
    COOKIE_SECURE: env.COOKIE_SECURE ?? env.NODE_ENV === "production",
    allowedOrigins: env.PUBLIC_URL ? [new URL(env.PUBLIC_URL).origin] : [DEFAULT_DEV_ORIGIN],
  }));

export type Env = z.infer<typeof envSchema>;

/** Empty values count as unset: docker compose passes an unset `${VAR:-}` as an empty string. */
function withoutEmptyValues(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value !== ""),
  );
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse(withoutEmptyValues(source));
}
