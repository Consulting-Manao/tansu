import { describe, it } from "vitest";
import { exportDecodedVotes } from "../../../scripts/export-decoded-votes";

// Manual runner, not a real test: exports decoded anonymous votes to CSV for
// a project, using a maintainer key-file, when a wallet can't be connected
// (see dapp/scripts/export-decoded-votes.ts for why this runs via vitest).
// No-ops unless EXPORT_KEY_FILE is set, so it never affects normal test runs:
//   EXPORT_KEY_FILE=/path/to/key.json [EXPORT_PROJECT_NAME=stellarpgq3] \
//     bunx vitest run tests/unit/scripts/export-decoded-votes.test.ts
const keyFilePath = process.env.EXPORT_KEY_FILE;
const projectName = process.env.EXPORT_PROJECT_NAME || "stellarpgq3";

describe.skipIf(!keyFilePath)("export-decoded-votes (manual)", () => {
  it("exports decoded votes CSVs for the project", async () => {
    await exportDecodedVotes(keyFilePath!, projectName);
  }, 900_000);
});
