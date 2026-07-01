import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

const chromiumExecutablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  process.env.CHROMIUM_PATH,
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].find((candidate) => candidate && existsSync(candidate));

const browserLaunchOptions = {
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-extensions",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
  ],
  ...(chromiumExecutablePath ? { executablePath: chromiumExecutablePath } : {}),
};

const e2eEnv = {
  PUBLIC_DELEGATION_API_URL:
    process.env.PUBLIC_DELEGATION_API_URL ?? "https://ipfs-testnet.tansu.dev",
  PUBLIC_SOROBAN_RPC_URL:
    process.env.PUBLIC_SOROBAN_RPC_URL ??
    "https://soroban-testnet.stellar.org:443",
  PUBLIC_SOROBAN_NETWORK_PASSPHRASE:
    process.env.PUBLIC_SOROBAN_NETWORK_PASSPHRASE ??
    "Test SDF Network ; September 2015",
  PUBLIC_HORIZON_URL:
    process.env.PUBLIC_HORIZON_URL ?? "https://horizon-testnet.stellar.org",
  PUBLIC_TANSU_CONTRACT_ID:
    process.env.PUBLIC_TANSU_CONTRACT_ID ??
    "CTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT",
  PUBLIC_TANSU_OWNER_ID:
    process.env.PUBLIC_TANSU_OWNER_ID ??
    "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
};

const webServerEnv = Object.fromEntries(
  Object.entries({
    ...process.env,
    ...e2eEnv,
  }).filter((entry): entry is [string, string] => entry[1] !== undefined),
);

export default defineConfig({
  testDir: "./tests",
  testMatch: [
    "**/essential-flows.spec.ts",
    "**/comprehensive-flows.spec.ts",
    "**/regression-prevention.spec.ts",
    "**/governance-flows.spec.ts",
    "**/happy-flows.spec.ts",
    "**/anonymous-*.spec.ts",
    "**/git-identity-flows.spec.ts",
  ],

  // Performance optimizations
  timeout: 90000,
  expect: { timeout: 15000 },

  // Fast execution settings
  fullyParallel: true,
  retries: 0,
  ...(process.env.CI ? { workers: 1 } : {}),

  // Minimal reporting for speed
  reporter: [["line"]],

  // No screenshots/videos for performance
  use: {
    baseURL: "http://localhost:4321",
    actionTimeout: 15000,
    navigationTimeout: 30000,
    trace: "off",
    screenshot: "off",
    video: "off",
    ...devices["Desktop Chrome"],
    // Use custom executable path if found, otherwise default to Playwright's chromium
    ...(chromiumExecutablePath
      ? { executablePath: chromiumExecutablePath }
      : {}),
    launchOptions: browserLaunchOptions,
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: "bun dev",
    env: webServerEnv,
    url: "http://localhost:4321",
    reuseExistingServer: !process.env.CI,
  },
});
