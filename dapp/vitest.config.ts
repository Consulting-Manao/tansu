import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globals: false,
  },
  resolve: {
    alias: {
      types: path.resolve(__dirname, "src/types"),
      utils: path.resolve(__dirname, "src/utils"),
      service: path.resolve(__dirname, "src/service"),
      "@service": path.resolve(__dirname, "src/service"),
      contracts: path.resolve(__dirname, "src/contracts"),
    },
  },
});
