import type { QueryKey } from "./cacheTypes";

export const queryKeys = {
  projects: {
    all: ["projects"] as const,
    page: (page: number): QueryKey => ["projects", page],
  },
  project: {
    detail: (projectName: string): QueryKey => ["project", projectName],
    byId: (projectId: string): QueryKey => ["project", "id", projectId],
    hash: (projectName: string): QueryKey => ["project", projectName, "hash"],
  },
  proposals: {
    all: (projectName: string): QueryKey => ["proposals", projectName],
    pages: (projectName: string): QueryKey => [
      "proposals",
      projectName,
      "pages",
    ],
    // UI aggregate page (up to 2 contract pages). Distinct from daoPage so
    // nested getProposals fetches cannot overwrite the combined list result.
    list: (projectName: string, page: number): QueryKey => [
      "proposals",
      projectName,
      "ui",
      page,
    ],
    daoPage: (projectName: string, page: number): QueryKey => [
      "proposals",
      projectName,
      "dao",
      page,
    ],
    voterSummary: (projectName: string, address: string): QueryKey => [
      "proposals",
      projectName,
      "voter",
      address,
    ],
  },
  proposal: {
    raw: (projectName: string, proposalId: string | number): QueryKey => [
      "proposal",
      projectName,
      proposalId,
      "raw",
    ],
    detail: (projectName: string, proposalId: string | number): QueryKey => [
      "proposal",
      projectName,
      proposalId,
    ],
  },
  membership: {
    detail: (address: string): QueryKey => ["membership", address],
  },
  evidence: {
    all: (projectId: string): QueryKey => ["evidence", projectId],
    commit: (projectId: string, commitHash: string): QueryKey => [
      "evidence",
      projectId,
      commitHash,
    ],
    byKind: (projectId: string, commitHash: string, kind: string): QueryKey => [
      "evidence",
      projectId,
      commitHash,
      kind,
    ],
    history: (
      projectId: string,
      commitHash: string,
      kind: string,
    ): QueryKey => ["evidence", projectId, commitHash, kind, "history"],
  },
  attestations: {
    all: (projectId: string): QueryKey => ["attestations", projectId],
    commit: (projectId: string, commitHash: string): QueryKey => [
      "attestations",
      projectId,
      commitHash,
    ],
    byTarget: (
      projectId: string,
      commitHash: string,
      targetKey: string,
    ): QueryKey => ["attestations", projectId, commitHash, targetKey],
    finality: (
      projectId: string,
      commitHash: string,
      targetKey: string,
    ): QueryKey => [
      "attestations",
      projectId,
      commitHash,
      targetKey,
      "finality",
    ],
    threshold: (projectId: string): QueryKey => [
      "attestations",
      projectId,
      "threshold",
    ],
  },
  ipfs: {
    response: (cid: string, path: string): QueryKey => ["ipfs", cid, path],
    json: (cid: string, path: string): QueryKey => ["ipfs", cid, path, "json"],
    toml: (cid: string): QueryKey => ["ipfs", cid, "toml"],
  },
} as const;
