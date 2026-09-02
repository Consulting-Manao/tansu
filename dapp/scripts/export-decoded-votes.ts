// Standalone export of anonymous-voting decoded votes to CSV, for use when a
// maintainer wallet can't be connected in the browser dApp. Reuses the same
// decode/CSV logic as the UI (utils/anonymousVoting, utils/anonymousVotingCsv)
// so the output matches what ExportDecodedVotesModal would produce.
//
// Run via vitest (see tests/unit/scripts/export-decoded-votes.test.ts) since
// this module chain imports the "packages/tansu" workspace package by
// relative path, which only the project's Vite-based resolver (used by
// vitest) resolves correctly - plain `bun run`/`node` cannot.

import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  getProposalPages,
  getProposals,
} from "../src/service/ReadContractService";
import { computeAnonymousVotingData } from "../src/utils/anonymousVoting";
import { buildDecodedVotesCsv } from "../src/utils/anonymousVotingCsv";
import type { Proposal } from "../src/types/proposal";

export interface ExportResult {
  outDir: string;
  exported: number;
  skipped: number;
}

function sanitizeForFilename(value: string): string {
  return value
    .trim()
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "");
}

export async function exportDecodedVotes(
  keyFilePath: string,
  projectName: string,
): Promise<ExportResult> {
  const parsedKey = JSON.parse(readFileSync(keyFilePath, "utf-8"));
  if (!parsedKey.privateKey) {
    throw new Error("Invalid key-file – missing privateKey field");
  }

  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const outDir = join(scriptDir, "..", "..", "decoded-votes-export");
  mkdirSync(outDir, { recursive: true });

  const pages = (await getProposalPages(projectName)) ?? 1;

  const proposals: Proposal[] = [];
  for (let page = 0; page < pages; page++) {
    const pageProposals = await getProposals(projectName, page);
    if (pageProposals) proposals.push(...pageProposals);
  }

  console.log(
    `Found ${proposals.length} proposal(s) for project "${projectName}".`,
  );

  let exported = 0;
  let skipped = 0;

  for (const proposal of proposals) {
    if (proposal.publicVoting) {
      console.log(
        `  [skip] proposal ${proposal.id}: public voting, nothing to decode`,
      );
      skipped++;
      continue;
    }

    try {
      const data = await computeAnonymousVotingData(
        projectName,
        proposal.id,
        parsedKey.privateKey,
        false,
      );

      if (!data.decodedVotes || data.decodedVotes.length === 0) {
        console.log(`  [skip] proposal ${proposal.id}: no decoded votes`);
        skipped++;
        continue;
      }

      const csv = buildDecodedVotesCsv(data.decodedVotes);
      const titlePart = sanitizeForFilename(proposal.title);
      const fileName = `${projectName}-proposal-${proposal.id}${
        titlePart ? `-${titlePart}` : ""
      }-decoded-votes.csv`;
      writeFileSync(join(outDir, fileName), csv, "utf-8");
      console.log(
        `  [ok]   proposal ${proposal.id}: exported ${data.decodedVotes.length} vote(s) -> ${fileName}`,
      );
      exported++;
    } catch (err: any) {
      console.log(`  [skip] proposal ${proposal.id}: ${err.message ?? err}`);
      skipped++;
    }
  }

  console.log(
    `\nDone. Exported ${exported} CSV file(s), skipped ${skipped}. Output: ${outDir}`,
  );

  return { outDir, exported, skipped };
}
