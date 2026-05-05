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
  PUBLIC_SOROBAN_DOMAIN_CONTRACT_ID:
    process.env.PUBLIC_SOROBAN_DOMAIN_CONTRACT_ID ??
    "CAUORQ7XOSJOV6NLUK2A7FZSZP5Z55AQPEPMWDEZPQ4DDKSTXBBEDKNF",
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
  ],

  // Performance optimizations
  timeout: 30000,
  expect: { timeout: 5000 },

  // Fast execution settings
  fullyParallel: true,
  retries: 0,
  // Use more workers locally for speed; keep single worker on CI for stability
  ...(process.env.CI ? { workers: 1 } : {}),

  // Minimal reporting for speed
  reporter: [["line"]],

  // No screenshots/videos for performance
  use: {
    actionTimeout: 5000,
    navigationTimeout: 10000,
    trace: "off",
    screenshot: "off",
    video: "off",
    ...devices["Desktop Chrome"],
    // Fast Chrome settings
    ...(chromiumExecutablePath ? {} : { channel: "chrome" }),
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
    port: 4321,
    reuseExistingServer: !process.env.CI,
  },
});
