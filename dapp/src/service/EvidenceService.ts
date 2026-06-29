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

/**
 * Read the stored evidence history for one project commit and kind.
 *
 * The contract returns the entries oldest-first (the last element is the
 * latest), or an empty array when nothing has been recorded.
 */
async function readEvidenceFromContract(
  projectKey: Buffer,
  commitHash: string,
  kind: EvidenceKind,
): Promise<Evidence[]> {
  const res = await Tansu.get_evidence({
    project_key: projectKey,
    commit_hash: commitHash,
    kind,
  });

  checkSimulationError(res);
  return (res.result as Evidence[] | undefined) ?? [];
}

/**
 * Read the latest evidence pointer for one project commit and evidence kind.
 *
 * The contract stores a bounded, append-only history at
 * (project_key, commit_hash, kind), so this remains backend-less and does not
 * require event indexing. Returns `null` when no evidence has been recorded.
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
      const history = await readEvidenceFromContract(
        projectKey,
        commitHash,
        contractKind,
      );
      const latest = history.at(-1);
      return latest ? { kind: kindTag, ...latest } : null;
    },
    { ttlMs: TTL_4H },
  );
}

/**
 * Read the on-chain evidence history for one commit and kind.
 *
 * Evidence is stored on-chain as a bounded, append-only log keyed by
 * (project_key, commit_hash, kind), so the recent timeline (e.g. successive CVE
 * re-scans of the same commit) is recoverable directly from the contract — no
 * backend needed. Entries are returned oldest-first; the last element is the
 * latest. Older entries beyond the on-chain cap remain available from
 * `EvidenceSet` events via an indexer.
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
      const history = await readEvidenceFromContract(
        projectKey,
        commitHash,
        contractKind,
      );
      return history.map((evidence) => ({ kind: kindTag, ...evidence }));
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
