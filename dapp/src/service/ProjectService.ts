/**
 * Project reads: one query per record the contract keeps for a project.
 *
 * Keys start with the domain and the project key in hex, so a write refreshes
 * what it changed by prefix (see `invalidateAfter` in queryClient.ts).
 */
import { queryOptions, useQuery } from "@tanstack/react-query";
import { Buffer } from "buffer";
import { useMemo } from "react";
import type { Badge, Project } from "../../packages/tansu";
import { tansuFor, tansuReads } from "../contracts/soroban_tansu";
import type { ConfigData } from "../types/projectConfig";
import { isValidCid, isValidCommitHash } from "../utils/contentHashes";
import { readResult } from "../utils/contractErrors";
import { normalizeRepositoryUrl } from "../utils/editLinkFunctions";
import { ipfsQuery, parseTansuToml } from "../utils/ipfsFunctions";
import { deriveProjectKey, projectKeyHex } from "../utils/projectKey";
import { extractConfigData } from "../utils/utils";
import { queryClient } from "./queryClient";
import { packUpload, sendTransaction } from "./TxService";
import { connectedAddress } from "./walletService";

const MINUTE = 60_000;

/** A page of registered projects; none past the last page. */
export const projectsQuery = (page: number) =>
  queryOptions({
    queryKey: ["projects", page],
    queryFn: async () =>
      readResult(await tansuReads.get_projects({ page }), 302) ?? [],
    staleTime: 10 * MINUTE,
  });

/**
 * A project by its key in hex, as sub-projects and members refer to it;
 * `null` when no project has that key.
 */
export const projectByKeyQuery = (key: string) =>
  queryOptions({
    queryKey: ["project", key],
    queryFn: async () =>
      readResult(
        await tansuReads.get_project({ project_key: Buffer.from(key, "hex") }),
        200,
      ),
    staleTime: 10 * MINUTE,
  });

/** A project by name; `null` when no project has that name. */
export const projectQuery = (name: string) =>
  projectByKeyQuery(projectKeyHex(name));

/** The last commit hash a maintainer set; `null` before the first one. */
export const commitQuery = (name: string) =>
  queryOptions({
    queryKey: ["commit", projectKeyHex(name)],
    queryFn: async () =>
      readResult(
        await tansuReads.get_commit({ project_key: deriveProjectKey(name) }),
        200,
        300,
      ),
    staleTime: 5 * MINUTE,
  });

/** Who holds which badge in a project. */
export const badgesQuery = (name: string) =>
  queryOptions({
    queryKey: ["badges", projectKeyHex(name)],
    queryFn: async () =>
      readResult(await tansuReads.get_badges({ key: deriveProjectKey(name) })),
    staleTime: 10 * MINUTE,
  });

/** The project's anonymous voting setup; `null` until a maintainer makes it. */
export const anonymousConfigQuery = (name: string) =>
  queryOptions({
    queryKey: ["anonymousConfig", projectKeyHex(name)],
    queryFn: async () =>
      readResult(
        await tansuReads.get_anonymous_voting_config({
          project_key: deriveProjectKey(name),
        }),
        303,
      ),
    staleTime: 60 * MINUTE,
  });

/**
 * A project's display config, from its tansu.toml. Until the file loads, or
 * when it cannot, the config holds what the contract alone gives.
 */
export function useProjectConfig(project: Project): {
  config: ConfigData;
  isLoading: boolean;
};
export function useProjectConfig(project: Project | null | undefined): {
  config: ConfigData | null;
  isLoading: boolean;
};
export function useProjectConfig(project: Project | null | undefined) {
  const cid = project?.config.ipfs ?? "";
  const toml = useQuery(
    {
      ...ipfsQuery(cid, "/tansu.toml"),
      select: parseTansuToml,
      enabled: !!project && isValidCid(cid),
    },
    queryClient,
  );
  const config = useMemo(
    () =>
      project
        ? (extractConfigData(toml.data ?? {}, project) as ConfigData)
        : null,
    [project, toml.data],
  );
  return { config, isLoading: toml.isLoading };
}

/** A project's configuration: maintainers, repository and tansu.toml. */
interface ProjectConfigWrite {
  tomlFile: File;
  repositoryUrl: string;
  maintainers: string[];
  /** More files for the project's directory, e.g. a README. */
  additionalFiles?: File[];
  /**
   * Governance settings; `undefined` keeps the current value, or the
   * contract's default for a new project.
   */
  minVotingPeriod?: bigint;
  executeDelay?: bigint;
  attestationThreshold?: number;
  onProgress?: (step: number) => void;
}

/** Register a project: its files on IPFS, its name and settings on chain. */
export async function registerProject(
  name: string,
  config: ProjectConfigWrite,
): Promise<void> {
  const upload = await packUpload([
    config.tomlFile,
    ...(config.additionalFiles ?? []),
  ]);
  config.onProgress?.(7);
  const address = connectedAddress();
  const tx = await tansuFor(address).register({
    maintainer: address,
    name,
    maintainers: config.maintainers,
    url: normalizeRepositoryUrl(config.repositoryUrl) ?? config.repositoryUrl,
    ipfs: upload.cid,
    min_voting_period: config.minVotingPeriod,
    execute_delay: config.executeDelay,
    attestation_threshold: config.attestationThreshold,
  });
  await sendTransaction(tx, {
    upload,
    onProgress: config.onProgress,
    invalidate: [["projects"], ["project", projectKeyHex(name)]],
  });
}

/** Replace a project's configuration; its name stays. */
export async function updateConfig(
  name: string,
  config: ProjectConfigWrite & {
    /** The project's directory the form was filled from. */
    basedOn: string;
  },
): Promise<void> {
  // A change another maintainer made since would be overwritten.
  const current = await queryClient.query({
    ...projectQuery(name),
    staleTime: 0,
  });
  if (current?.config.ipfs !== config.basedOn) {
    throw new Error(
      "Another maintainer updated this project meanwhile. Close this dialog and open it again to edit their version.",
    );
  }
  const upload = await packUpload([
    config.tomlFile,
    ...(config.additionalFiles ?? []),
  ]);
  config.onProgress?.(7);
  const address = connectedAddress();
  const tx = await tansuFor(address).update_config({
    maintainer: address,
    key: deriveProjectKey(name),
    maintainers: config.maintainers,
    url: normalizeRepositoryUrl(config.repositoryUrl) ?? config.repositoryUrl,
    ipfs: upload.cid,
    min_voting_period: config.minVotingPeriod,
    execute_delay: config.executeDelay,
    attestation_threshold: config.attestationThreshold,
  });
  const key = projectKeyHex(name);
  await sendTransaction(tx, {
    upload,
    onProgress: config.onProgress,
    invalidate: [["project", key], ["projects"], ["threshold", key]],
  });
}

/**
 * Record the project's latest commit. For software it is a Git object name,
 * SHA-1 or SHA-256; other projects use it as a milestone identifier.
 */
export async function commitHash(name: string, hash: string): Promise<void> {
  if (!isValidCommitHash(hash)) {
    throw new Error(
      "Invalid commit hash: expected a 40-character (SHA-1) or 64-character (SHA-256) hex string",
    );
  }
  const address = connectedAddress();
  const tx = await tansuFor(address).commit({
    maintainer: address,
    project_key: deriveProjectKey(name),
    hash,
  });
  await sendTransaction(tx, { invalidate: [["commit", projectKeyHex(name)]] });
}

/** Set the badges a member holds in the project. */
export async function setBadges(
  name: string,
  member: string,
  badges: Badge[],
): Promise<void> {
  const address = connectedAddress();
  const tx = await tansuFor(address).set_badges({
    maintainer: address,
    key: deriveProjectKey(name),
    member,
    badges,
  });
  const key = projectKeyHex(name);
  await sendTransaction(tx, {
    invalidate: [
      ["badges", key],
      ["member", member],
      ["votingPower", key, member],
    ],
  });
}

/**
 * Make the project an organization of these projects, by key in hex (none:
 * it is not one).
 */
export async function setSubProjects(
  name: string,
  subProjectKeys: string[],
): Promise<void> {
  const address = connectedAddress();
  const tx = await tansuFor(address).set_sub_projects({
    maintainer: address,
    project_key: deriveProjectKey(name),
    sub_projects: subProjectKeys.map((key) => Buffer.from(key, "hex")),
  });
  await sendTransaction(tx, { invalidate: [["project", projectKeyHex(name)]] });
}
