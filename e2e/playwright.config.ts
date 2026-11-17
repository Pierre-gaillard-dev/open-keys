import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { ADMIN, API_PORT, WEB_URL } from "./support/env";

/**
 * End-to-end tests (docs/03-architecture/09-tests.md): the production build of the web app (with its
 * service worker) and a real API on an empty database, in Chromium and Firefox.
 */
const dataDir = mkdtempSync(join(tmpdir(), "open-keys-e2e-"));

export default defineConfig({
  testDir: "tests",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env["CI"]),
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? [["list"], ["html", { open: "never" }]] : "list",
  timeout: 60_000,
  use: {
    baseURL: WEB_URL,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "firefox",
      use: {
        ...devices["Desktop Firefox"],
        // Audio starts from Playwright's clicks, as from a user's. Without a GPU (CI), PixiJS falls back
        // to its Canvas 2D renderer; without a sound card, see the PulseAudio step of the CI job.
        launchOptions: { firefoxUserPrefs: { "media.autoplay.default": 0 } },
      },
    },
  ],
  webServer: [
    {
      command: "pnpm --filter @open-keys/server exec tsx src/index.ts",
      url: `http://localhost:${API_PORT}/api/health`,
      env: {
        PORT: String(API_PORT),
        DATA_DIR: dataDir,
        PUBLIC_URL: WEB_URL,
        ADMIN_USERNAME: ADMIN.username,
        ADMIN_PASSWORD: ADMIN.password,
        LOG_LEVEL: "warn",
        // Never crawl the real Mutopia site from the tests.
        MUTOPIA_SYNC: "false",
      },
      reuseExistingServer: false,
    },
    {
      command:
        "pnpm --filter @open-keys/web build && pnpm --filter @open-keys/web exec vite preview --port 4173 --strictPort",
      url: WEB_URL,
      env: { API_PROXY_TARGET: `http://localhost:${API_PORT}` },
      timeout: 180_000,
      reuseExistingServer: false,
    },
  ],
});
