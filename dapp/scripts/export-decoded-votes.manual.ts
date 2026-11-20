import { describe, it } from "vitest";
import { exportDecodedVotes } from "./export-decoded-votes";

// Manual runner, not a real test: exports decoded anonymous votes to CSV for
// a project, using a maintainer key-file, when a wallet can't be connected
// (see dapp/scripts/export-decoded-votes.ts for why this runs via vitest).
// Explicitly selected by export-decoded-votes.config.ts, never by test:unit:
//   EXPORT_KEY_FILE=/path/to/key.json [EXPORT_PROJECT_NAME=stellarpgq3] \
//     bun run export:votes
const keyFilePath = process.env.EXPORT_KEY_FILE;
const projectName = process.env.EXPORT_PROJECT_NAME || "stellarpgq3";

describe("export-decoded-votes (manual)", () => {
  it("exports decoded votes CSVs for the project", async () => {
    if (!keyFilePath)
      throw new Error("Set EXPORT_KEY_FILE to a maintainer key file.");
    await exportDecodedVotes(keyFilePath, projectName);
  }, 900_000);
});
