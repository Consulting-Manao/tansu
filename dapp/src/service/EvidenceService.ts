import { Buffer } from "buffer";

import type { Evidence, EvidenceKind } from "../../packages/tansu";
import Tansu from "../contracts/soroban_tansu";
import { checkSimulationError } from "../utils/contractErrors";
import { deriveProjectKey } from "../utils/projectKey";
import { fetchWithCache, invalidateQuery } from "./cache/cacheStore";
import { queryKeys } from "./cache/cacheKeys";

const TTL_4H = 4 * 60 * 60 * 1000;

export type EvidenceKindTag = EvidenceKind["tag"];

export interface CommitEvidence extends Evidence {
  kind: EvidenceKindTag;
}

export const EVIDENCE_KIND_TAGS = [
  "Sbom",
  "Cve",
  "Attestation",
] as const satisfies readonly EvidenceKindTag[];

function projectKeyFromInput(project: string | Buffer): Buffer {
  return Buffer.isBuffer(project) ? project : deriveProjectKey(project);
}

export function toEvidenceKind(
  kind: EvidenceKind | EvidenceKindTag,
): EvidenceKind {
  if (typeof kind === "string") {
    return { tag: kind, values: undefined };
  }
  return kind;
}

function evidenceKindTag(
  kind: EvidenceKind | EvidenceKindTag,
): EvidenceKindTag {
  return typeof kind === "string" ? kind : kind.tag;
}

function isMissingEvidenceError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("#304") ||
    message.includes("Contract error #304") ||
    message.includes("No evidence was found") ||
    message.includes("NoEvidenceFound")
  );
}

async function readEvidenceFromContract(
  projectKey: Buffer,
  commitHash: string,
  kind: EvidenceKind,
): Promise<Evidence> {
  const res = await Tansu.get_evidence({
    project_key: projectKey,
    commit_hash: commitHash,
    kind,
  });

  checkSimulationError(res);
  return res.result as Evidence;
}

/**
 * Read the latest evidence pointer for one project commit and evidence kind.
 *
 * The contract stores the latest value at (project_key, commit_hash, kind), so
 * this remains backend-less and does not require event indexing.
 */
export async function getEvidenceByKind(
  project: string | Buffer,
  commitHash: string,
  kind: EvidenceKind | EvidenceKindTag,
): Promise<CommitEvidence | null> {
  if (!commitHash.trim()) return null;

  const projectKey = projectKeyFromInput(project);
  const projectId = projectKey.toString("hex");
  const kindTag = evidenceKindTag(kind);
  const contractKind = toEvidenceKind(kind);

  return await fetchWithCache(
    queryKeys.evidence.byKind(projectId, commitHash, kindTag),
    async () => {
      try {
        const evidence = await readEvidenceFromContract(
          projectKey,
          commitHash,
          contractKind,
        );
        return {
          kind: kindTag,
          ...evidence,
        };
      } catch (error) {
        if (isMissingEvidenceError(error)) return null;
        throw error;
      }
    },
    { ttlMs: TTL_4H },
  );
}

/**
 * Read the full append-only evidence history for one commit and kind.
 *
 * Evidence is stored on-chain as an append-only log keyed by index, so the
 * complete timeline (e.g. successive CVE re-scans of the same commit) is
 * recoverable directly from the contract — no backend or event indexer needed.
 * Entries are returned oldest-first; the last element is the latest.
 */
export async function getEvidenceHistory(
  project: string | Buffer,
  commitHash: string,
  kind: EvidenceKind | EvidenceKindTag,
): Promise<CommitEvidence[]> {
  if (!commitHash.trim()) return [];

  const projectKey = projectKeyFromInput(project);
  const projectId = projectKey.toString("hex");
  const kindTag = evidenceKindTag(kind);
  const contractKind = toEvidenceKind(kind);

  return await fetchWithCache(
    queryKeys.evidence.history(projectId, commitHash, kindTag),
    async () => {
      const countRes = await Tansu.get_evidence_count({
        project_key: projectKey,
        commit_hash: commitHash,
        kind: contractKind,
      });
      checkSimulationError(countRes);

      const count = Number(countRes.result ?? 0);
      if (count === 0) return [];

      return await Promise.all(
        Array.from({ length: count }, async (_, index) => {
          const res = await Tansu.get_evidence_at({
            project_key: projectKey,
            commit_hash: commitHash,
            kind: contractKind,
            index,
          });
          checkSimulationError(res);
          return { kind: kindTag, ...(res.result as Evidence) };
        }),
      );
    },
    { ttlMs: TTL_4H },
  );
}

/**
 * Read all known evidence kinds for a commit.
 *
 * Missing kinds are omitted from the returned array.
 */
export async function getEvidenceForCommit(
  project: string | Buffer,
  commitHash: string,
): Promise<CommitEvidence[]> {
  if (!commitHash.trim()) return [];

  const projectKey = projectKeyFromInput(project);
  const projectId = projectKey.toString("hex");

  return await fetchWithCache(
    queryKeys.evidence.commit(projectId, commitHash),
    async () => {
      const evidence = await Promise.all(
        EVIDENCE_KIND_TAGS.map((kind) =>
          getEvidenceByKind(projectKey, commitHash, kind),
        ),
      );

      return evidence.filter((item): item is CommitEvidence => item !== null);
    },
    { ttlMs: TTL_4H },
  );
}

export function invalidateEvidenceCache(
  project: string | Buffer,
  commitHash?: string,
): void {
  const projectId = projectKeyFromInput(project).toString("hex");

  if (commitHash) {
    invalidateQuery(queryKeys.evidence.commit(projectId, commitHash));
    return;
  }

  invalidateQuery(queryKeys.evidence.all(projectId));
}
