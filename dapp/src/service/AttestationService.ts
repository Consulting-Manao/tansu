import { queryOptions } from "@tanstack/react-query";

import type { AttestationTarget, EvidenceKind } from "../../packages/tansu";
import { tansuReads } from "../contracts/soroban_tansu";
import { readResult } from "../utils/contractErrors";
import { deriveProjectKey, projectKeyHex } from "../utils/projectKey";
import { toEvidenceKind, type EvidenceKindTag } from "./EvidenceService";

const MINUTE = 60_000;

export interface CommitFinality {
  attested: number;
  total: number;
  percent: number;
  isFinal: boolean;
  finalizedAt: number | null;
}

export function commitTarget(): AttestationTarget {
  return { tag: "Commit", values: undefined };
}

export function evidenceTarget(
  kind: EvidenceKind | EvidenceKindTag,
  cid: string,
): AttestationTarget {
  return { tag: "Evidence", values: [toEvidenceKind(kind), cid] };
}

/** Stable query-key fragment for a target. */
function targetKey(target: AttestationTarget): string {
  if (target.tag === "Commit") return "Commit";
  const [kind, cid] = target.values;
  return `Evidence:${kind.tag}:${cid}`;
}

/**
 * The attestations recorded for a commit or evidence target: oldest first,
 * at most one per attester.
 */
export const attestationsQuery = (
  name: string,
  commitHash: string,
  target: AttestationTarget,
) =>
  queryOptions({
    queryKey: [
      "attestations",
      projectKeyHex(name),
      commitHash,
      targetKey(target),
    ],
    queryFn: async () =>
      readResult(
        await tansuReads.get_attestations({
          project_key: deriveProjectKey(name),
          commit_hash: commitHash,
          target,
        }),
      ),
    staleTime: MINUTE,
  });

/**
 * Whether a target is final, as the contract computes it: the threshold
 * comparison runs on chain and is never re-derived here. `finalizedAt` is set
 * once the target has latched as final.
 */
export const finalityQuery = (
  name: string,
  commitHash: string,
  target: AttestationTarget,
) =>
  queryOptions({
    queryKey: [
      "attestations",
      projectKeyHex(name),
      commitHash,
      targetKey(target),
      "finality",
    ],
    queryFn: async (): Promise<CommitFinality> => {
      const { attested, total, is_final, finalized_at } = readResult(
        await tansuReads.get_attestation_finality({
          project_key: deriveProjectKey(name),
          commit_hash: commitHash,
          target,
        }),
      );
      return {
        attested,
        total,
        percent: total ? Math.round((attested / total) * 100) : 0,
        isFinal: is_final,
        finalizedAt: finalized_at != null ? Number(finalized_at) : null,
      };
    },
    staleTime: MINUTE,
  });

/** The project's finality threshold, in percent. */
export const thresholdQuery = (name: string) =>
  queryOptions({
    queryKey: ["threshold", projectKeyHex(name)],
    queryFn: async () =>
      readResult(
        await tansuReads.get_attestation_threshold({
          project_key: deriveProjectKey(name),
        }),
      ),
    staleTime: 10 * MINUTE,
  });
