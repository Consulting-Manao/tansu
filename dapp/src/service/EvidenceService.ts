import { queryOptions } from "@tanstack/react-query";

import type { Evidence, EvidenceKind } from "../../packages/tansu";
import { tansuReads } from "../contracts/soroban_tansu";
import { readResult } from "../utils/contractErrors";
import { deriveProjectKey, projectKeyHex } from "../utils/projectKey";

export type EvidenceKindTag = EvidenceKind["tag"];

export interface CommitEvidence extends Evidence {
  kind: EvidenceKindTag;
}

export function toEvidenceKind(
  kind: EvidenceKind | EvidenceKindTag,
): EvidenceKind {
  if (typeof kind === "string") {
    return { tag: kind, values: undefined };
  }
  return kind;
}

/**
 * The evidence of one kind recorded for a commit, oldest first (the last entry
 * is the latest).
 *
 * The contract keeps a bounded, append-only history per (project, commit,
 * kind), so the recent timeline (e.g. successive CVE scans of a commit) needs
 * no backend. Older entries beyond the on-chain cap remain available from
 * `EvidenceSet` events via an indexer.
 */
export const evidenceQuery = (
  name: string,
  commitHash: string,
  kind: EvidenceKindTag,
) =>
  queryOptions({
    queryKey: ["evidence", projectKeyHex(name), commitHash, kind],
    queryFn: async (): Promise<CommitEvidence[]> =>
      readResult(
        await tansuReads.get_evidence({
          project_key: deriveProjectKey(name),
          commit_hash: commitHash,
          kind: toEvidenceKind(kind),
        }),
      ).map((evidence) => ({ kind, ...evidence })),
    staleTime: 5 * 60_000,
  });
