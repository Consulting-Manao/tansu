import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";
import { E2E_ENV, E2E_PORT } from "./tests/helpers/env";

const chromiumExecutablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  process.env.CHROMIUM_PATH,
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].find((candidate) => candidate && existsSync(candidate));

/**
 * The tests walk through the production build, served from dist/, against
 * the fakes in tests/helpers: a Tansu contract behind a Soroban RPC, the IPFS
 * gateway, Horizon, the upload worker, GitHub and a GHOSTSIG wallet.
 */
export default defineConfig({
  testDir: "./tests",
  testMatch: "*.spec.ts",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  retries: 0,
  ...(process.env.CI ? { workers: 1 } : {}),
  reporter: [["line"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://localhost:${E2E_PORT}`,
    serviceWorkers: "block",
    trace: "retain-on-failure",
    launchOptions: {
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
      ...(chromiumExecutablePath
        ? { executablePath: chromiumExecutablePath }
        : {}),
    },
  },
  webServer: {
    command: "bun run build && bun tests/helpers/serve.ts",
    env: {
      ...(Object.fromEntries(
        Object.entries(process.env).filter(([, value]) => value !== undefined),
      ) as Record<string, string>),
      ...E2E_ENV,
      E2E_PORT: String(E2E_PORT),
    },
    url: `http://localhost:${E2E_PORT}`,
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
  },
});
