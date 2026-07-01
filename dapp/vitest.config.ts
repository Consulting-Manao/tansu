import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    globals: false,
  },
  resolve: {
    alias: {
      types: path.resolve(__dirname, "src/types"),
      utils: path.resolve(__dirname, "src/utils"),
      contracts: path.resolve(__dirname, "src/contracts"),
      schemas: path.resolve(__dirname, "src/schemas"),
      components: path.resolve(__dirname, "src/components"),
    },
  },
});
