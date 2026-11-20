import { defineConfig } from "vitest/config";
import unitConfig from "../vitest.config.ts";

// Keep the Vite aliases/env needed by the exporter's service imports, but do
// not collect unit tests or run this operational tool during test:unit.
export default defineConfig({
  ...unitConfig,
  test: {
    ...unitConfig.test,
    include: ["scripts/export-decoded-votes.manual.ts"],
  },
});
