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
 * testnet: the Tansu contract, Soroban RPC, Horizon, the IPFS upload worker
 * and git hosts are real. The GHOSTSIG wallet signs with friendbot-funded
 * test accounts (tests/helpers).
 */
export default defineConfig({
  testDir: "./tests",
  testMatch: "*.spec.ts",
  // Real transactions: a ledger closes about every 5 seconds.
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: true,
  retries: 0,
  workers: 2,
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
  projects: [
    { name: "flows", testIgnore: "update.spec.ts" },
    // Rebuilds dist/ the way a deploy would, so it runs after the flows.
    { name: "update", testMatch: "update.spec.ts", dependencies: ["flows"] },
  ],
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
    reuseExistingServer: false,
  },
});
