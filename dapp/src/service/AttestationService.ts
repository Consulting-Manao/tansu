import { Buffer } from "buffer";

import type {
  Attestation,
  AttestationTarget,
  EvidenceKind,
  FinalityStatus,
} from "../../packages/tansu";
import Tansu from "../contracts/soroban_tansu";
import { checkSimulationError } from "../utils/contractErrors";
import { deriveProjectKey } from "../utils/projectKey";
import { fetchWithCache, invalidateQuery } from "./cache/cacheStore";
import { queryKeys } from "./cache/cacheKeys";
import { toEvidenceKind, type EvidenceKindTag } from "./EvidenceService";

const TTL_4H = 4 * 60 * 60 * 1000;

export interface CommitFinality {
  attested: number;
  total: number;
  percent: number;
  isFinal: boolean;
}

function projectKeyFromInput(project: string | Buffer): Buffer {
  return Buffer.isBuffer(project) ? project : deriveProjectKey(project);
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

export function attestationTargetKey(target: AttestationTarget): string {
  if (target.tag === "Commit") return "Commit";
  const [kind, cid] = target.values;

  return `Evidence:${kind.tag}:${cid}`;
}

async function readAttestationsFromContract(
  projectKey: Buffer,
  commitHash: string,
  target: AttestationTarget,
): Promise<Attestation[]> {
  const res = await Tansu.get_attestations({
    project_key: projectKey,
    commit_hash: commitHash,
    target,
  });

  checkSimulationError(res);

  return (res.result as Attestation[] | undefined) ?? [];
}

export async function getAttestations(
  project: string | Buffer,
  commitHash: string,
  target: AttestationTarget,
): Promise<Attestation[]> {
  if (!commitHash.trim()) {
    return [];
  }

  const projectKey = projectKeyFromInput(project);
  const projectId = projectKey.toString("hex");

  return await fetchWithCache(
    queryKeys.attestations.byTarget(
      projectId,
      commitHash,
      attestationTargetKey(target),
    ),
    async () => {
      try {
        return await readAttestationsFromContract(
          projectKey,
          commitHash,
          target,
        );
      } catch {
        return [];
      }
    },
    { ttlMs: TTL_4H },
  );
}

export async function getCommitFinality(
  project: string | Buffer,
  commitHash: string,
  target: AttestationTarget = commitTarget(),
): Promise<CommitFinality> {
  if (!commitHash.trim()) {
    return { attested: 0, total: 0, percent: 0, isFinal: false };
  }

  const projectKey = projectKeyFromInput(project);
  const projectId = projectKey.toString("hex");

  return await fetchWithCache(
    queryKeys.attestations.finality(
      projectId,
      commitHash,
      attestationTargetKey(target),
    ),
    async () => {
      try {
        const res = await Tansu.get_attestation_finality({
          project_key: projectKey,
          commit_hash: commitHash,
          target,
        });
        checkSimulationError(res);

        const { attested, total, is_final } = res.result as FinalityStatus;
        const percent = total ? Math.round((attested / total) * 100) : 0;
        return { attested, total, percent, isFinal: is_final };
      } catch {
        return { attested: 0, total: 0, percent: 0, isFinal: false };
      }
    },
    { ttlMs: TTL_4H },
  );
}

export async function getAttestationThreshold(
  project: string | Buffer,
): Promise<number> {
  const projectKey = projectKeyFromInput(project);
  const projectId = projectKey.toString("hex");

  return await fetchWithCache(
    queryKeys.attestations.threshold(projectId),
    async () => {
      try {
        const res = await Tansu.get_attestation_threshold({
          project_key: projectKey,
        });
        checkSimulationError(res);
        return (res.result as number | undefined) ?? 0;
      } catch {
        return 0;
      }
    },
    { ttlMs: TTL_4H },
  );
}

export function invalidateAttestationCache(
  project: string | Buffer,
  commitHash?: string,
): void {
  const projectId = projectKeyFromInput(project).toString("hex");

  if (commitHash) {
    invalidateQuery(queryKeys.attestations.commit(projectId, commitHash));

    return;
  }

  invalidateQuery(queryKeys.attestations.all(projectId));
}
