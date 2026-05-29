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
    list: (projectName: string, page: number): QueryKey => [
      "proposals",
      projectName,
      page,
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
  ipfs: {
    response: (cid: string, path: string): QueryKey => ["ipfs", cid, path],
    json: (cid: string, path: string): QueryKey => ["ipfs", cid, path, "json"],
    toml: (cid: string): QueryKey => ["ipfs", cid, "toml"],
  },
} as const;
