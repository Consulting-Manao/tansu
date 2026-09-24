/**
 * Project reads: one query per record the contract keeps for a project.
 *
 * Keys start with the domain and the project key in hex, so a write refreshes
 * what it changed by prefix (see `invalidateAfter` in queryClient.ts).
 */
import { queryOptions, useQuery } from "@tanstack/react-query";
import { Buffer } from "buffer";
import { useMemo } from "react";
import type { Project } from "../../packages/tansu";
import { tansuReads } from "../contracts/soroban_tansu";
import type { ConfigData } from "../types/projectConfig";
import { isValidCid } from "../utils/contentHashes";
import { readResult } from "../utils/contractErrors";
import { ipfsQuery, parseTansuToml } from "../utils/ipfsFunctions";
import { deriveProjectKey, projectKeyHex } from "../utils/projectKey";
import { extractConfigData } from "../utils/utils";
import { queryClient } from "./queryClient";

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
