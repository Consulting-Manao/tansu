import { defineConfig } from "vitest/config";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parseEnv } from "util";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  envPrefix: "PUBLIC_",
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    globals: false,
    // The documented defaults, not a developer's local .env.
    env: parseEnv(
      readFileSync(path.resolve(__dirname, ".env.example"), "utf8"),
    ),
  },
  resolve: {
    alias: {
      "@service": path.resolve(__dirname, "src/service"),
      types: path.resolve(__dirname, "src/types"),
      utils: path.resolve(__dirname, "src/utils"),
      contracts: path.resolve(__dirname, "src/contracts"),
      schemas: path.resolve(__dirname, "src/schemas"),
      components: path.resolve(__dirname, "src/components"),
      service: path.resolve(__dirname, "src/service"),
    },
  },
});
