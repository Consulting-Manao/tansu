import Tansu from "../contracts/soroban_tansu";
import { deriveProjectKey } from "../utils/projectKey";
import { Buffer } from "buffer";
import { loadedProjectId } from "./StateService";
import { modifyProposalFromContract } from "utils/utils";
import type { Project, Proposal, Member, Badges } from "../../packages/tansu";
import type { Proposal as ModifiedProposal } from "types/proposal";
import { checkSimulationError } from "utils/contractErrors";

// TTL cache entry
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

function makeTtlCache<T>() {
  const store = new Map<string, CacheEntry<T>>();
  return {
    get(key: string): T | undefined {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (Date.now() > entry.expiresAt) {
        store.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key: string, value: T, ttlMs: number) {
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
    },
    deleteByPrefix(prefix: string) {
      for (const key of store.keys()) {
        if (key.startsWith(prefix)) store.delete(key);
      }
    },
  };
}

const TTL_4H = 4 * 60 * 60 * 1000;
const TTL_1H = 60 * 60 * 1000;

// Proposal list caches (4h TTL)
const proposalPagesCache = makeTtlCache<number | null>();
const proposalsCache = makeTtlCache<Proposal[]>();

// Individual proposal cache (1h TTL)
const proposalCache = makeTtlCache<Proposal>();

// Lightweight session cache to avoid rehydrating the same proposal repeatedly.
const proposalHydrationCache = new Map<string, Proposal>();

const proposalCacheKey = (project_name: string, proposal_id: number) =>
  `${project_name}:${proposal_id}`;

const invalidateProposalHydrationCache = (project_name: string) => {
  const prefix = `${project_name}:`;
  for (const key of proposalHydrationCache.keys()) {
    if (key.startsWith(prefix)) {
      proposalHydrationCache.delete(key);
    }
  }
};

async function hydrateProposalFromDaoItem(
  project_name: string,
  project_key: Buffer,
  daoProposal: Proposal,
): Promise<Proposal> {
  const cacheKey = proposalCacheKey(project_name, Number(daoProposal.id));
  const cached = proposalHydrationCache.get(cacheKey);
  if (cached) return cached;

  try {
    const proposalRes = await Tansu.get_proposal({
      project_key,
      proposal_id: Number(daoProposal.id),
    });
    checkSimulationError(proposalRes);
    const hydratedProposal: Proposal = proposalRes.result;
    proposalHydrationCache.set(cacheKey, hydratedProposal);
    return hydratedProposal;
  } catch {
    // Keep list rendering resilient when a single hydration fails.
    return daoProposal;
  }
}

async function getProjectHash(): Promise<string | null> {
  const projectId = loadedProjectId();

  if (projectId === undefined) {
    // This is an expected condition when no project is selected
    return null;
  }

  // Ensure projectId is a proper Buffer
  const projectKey = Buffer.isBuffer(projectId)
    ? projectId
    : Buffer.from(projectId, "hex");

  try {
    const res = await Tansu.get_commit({
      project_key: projectKey,
    });

    // Check for simulation errors
    checkSimulationError(res);

    return res.result;
  } catch {
    // Never show toast error for project hash not found
    return null;
  }
}

async function getProject(): Promise<Project | null> {
  const projectId = loadedProjectId();

  if (projectId === undefined) {
    // This is an expected condition when no project is selected
    return null;
  }

  // Ensure projectId is a proper Buffer
  const projectKey = Buffer.isBuffer(projectId)
    ? projectId
    : Buffer.from(projectId, "hex");

  try {
    const res = await Tansu.get_project({
      project_key: projectKey,
    });

    // Check for simulation errors
    checkSimulationError(res);

    return res.result;
  } catch {
    // Never show toast error for project not found
    return null;
  }
}

async function getProjectFromName(
  projectName: string,
): Promise<Project | null> {
  // Skip if project name is empty
  if (!projectName || projectName.trim() === "") {
    return null;
  }

  const projectId = deriveProjectKey(projectName);

  try {
    const res = await Tansu.get_project({
      project_key: projectId,
    });

    // Check for simulation errors
    checkSimulationError(res);

    return res.result;
  } catch {
    // Never show toast error for project not found - this is always an expected condition
    // when searching for projects
    return null;
  }
}

async function getProjectFromId(projectId: Buffer): Promise<Project | null> {
  try {
    const res = await Tansu.get_project({
      project_key: projectId,
    });

    // Check for simulation errors
    checkSimulationError(res);

    return res.result;
  } catch {
    // Never show toast error for project not found
    return null;
  }
}

async function getProposalPages(project_name: string): Promise<number | null> {
  const cached = proposalPagesCache.get(project_name);
  if (cached !== undefined) return cached;

  const project_key = deriveProjectKey(project_name);

  try {
    const hasProposalsOnPage = async (page: number) => {
      try {
        const res = await Tansu.get_dao({
          project_key,
          page,
        });

        // Check for simulation errors
        checkSimulationError(res);

        return res.result.proposals.length > 0;
      } catch {
        // Silently handle errors for this internal function
        return false;
      }
    };

    if (!(await hasProposalsOnPage(0))) {
      proposalPagesCache.set(project_name, 1, TTL_4H);
      return 1;
    }

    let low = 0;
    let high = 1;

    while (await hasProposalsOnPage(high)) {
      low = high;
      high *= 2;
    }

    while (high - low > 1) {
      const middle = Math.floor((low + high) / 2);
      if (await hasProposalsOnPage(middle)) {
        low = middle;
      } else {
        high = middle;
      }
    }

    const result = low + 1;
    proposalPagesCache.set(project_name, result, TTL_4H);
    return result;
  } catch {
    // Never show toast error for proposal pages not found
    return null;
  }
}

async function getProposals(
  project_name: string,
  page: number,
): Promise<ModifiedProposal[] | null> {
  const cacheKey = `${project_name}:${page}`;
  const cached = proposalsCache.get(cacheKey);
  if (cached !== undefined) return cached.map(modifyProposalFromContract);

  const project_key = deriveProjectKey(project_name);
  try {
    // Invalidate project cache before list hydration to avoid stale list states.
    invalidateProposalHydrationCache(project_name);

    const res = await Tansu.get_dao({
      project_key: project_key,
      page: page,
    });

    // Check for simulation errors
    checkSimulationError(res);

    const hydratedProposals = await Promise.all(
      (res.result.proposals as Proposal[]).map((proposal) =>
        hydrateProposalFromDaoItem(project_name, project_key, proposal),
      ),
    );

    proposalsCache.set(cacheKey, hydratedProposals, TTL_4H);

    const proposals: ModifiedProposal[] = hydratedProposals.map((proposal) =>
      modifyProposalFromContract(proposal),
    );
    return proposals;
  } catch {
    // Never show toast error for proposals not found
    return null;
  }
}

async function getProposal(
  projectName: string,
  proposalId: number,
): Promise<ModifiedProposal | null> {
  const cacheKey = proposalCacheKey(projectName, proposalId);
  const cached = proposalCache.get(cacheKey);
  if (cached !== undefined) return modifyProposalFromContract(cached);

  const project_key = deriveProjectKey(projectName);
  try {
    const res = await Tansu.get_proposal({
      project_key: project_key,
      proposal_id: proposalId,
    });

    // Check for simulation errors
    checkSimulationError(res);

    const proposal: Proposal = res.result;
    proposalCache.set(cacheKey, proposal, TTL_1H);
    return modifyProposalFromContract(proposal);
  } catch {
    // Never show toast error for proposal not found
    return null;
  }
}

async function getMember(memberAddress: string): Promise<Member | null> {
  // Skip if address is empty
  if (!memberAddress || memberAddress.trim() === "") {
    return null;
  }

  try {
    const res = await Tansu.get_member({
      member_address: memberAddress,
    });

    // Check for simulation errors
    checkSimulationError(res);

    return res.result;
  } catch {
    // Never show toast error for member not found - this is always an expected condition
    // when searching for members
    return null;
  }
}

async function getBadges(): Promise<Badges | null> {
  const projectId = loadedProjectId();
  if (projectId === undefined) {
    // This is an expected condition when no project is selected
    return null;
  }

  // Ensure projectId is a proper Buffer
  const projectKey = Buffer.isBuffer(projectId)
    ? projectId
    : Buffer.from(projectId, "hex");

  try {
    // Use current bindings spec
    const res: any = await (Tansu as any).get_badges({ key: projectKey });

    // Check for simulation errors
    checkSimulationError(res);

    return res.result;
  } catch {
    // Never show toast error for badges not found
    return null;
  }
}

async function getProjectsPage(page: number): Promise<Project[]> {
  try {
    const res = await Tansu.get_projects({ page });
    checkSimulationError(res);

    return res.result || [];
  } catch {
    return [];
  }
}

/**
 * Invalidate all cached data for a specific proposal and its project's list caches.
 * Call this after any mutation (vote, execute) to prevent stale reads before TTL expiry.
 */
function invalidateProposalCache(
  project_name: string,
  proposal_id: number,
): void {
  const entryKey = proposalCacheKey(project_name, proposal_id);
  proposalCache.deleteByPrefix(entryKey);
  proposalsCache.deleteByPrefix(`${project_name}:`);
  proposalPagesCache.deleteByPrefix(project_name);
  invalidateProposalHydrationCache(project_name);
}

export {
  getProject,
  getProjectHash,
  getProjectFromName,
  getProjectFromId,
  getProposalPages,
  getProposals,
  getProposal,
  getMember,
  getBadges,
  getProjectsPage,
  invalidateProposalCache,
};

/**
 * Check whether anonymous voting is configured for a given project name.
 * Returns true when configuration exists, false otherwise.
 */
export async function hasAnonymousVotingConfig(
  projectName: string,
): Promise<boolean> {
  try {
    const project_key = deriveProjectKey(projectName);
    const tx = await (Tansu as any).get_anonymous_voting_config({
      project_key,
    });
    try {
      checkSimulationError(tx);
      return !!tx.result;
    } catch (_) {
      return false;
    }
  } catch (_) {
    return false;
  }
}
