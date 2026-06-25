import Tansu from "../contracts/soroban_tansu";
import { deriveProjectKey } from "../utils/projectKey";
import { Buffer } from "buffer";
import { loadedProjectId } from "./StateService";
import { modifyProposalFromContract } from "utils/utils";
import type { Project, Proposal, Member, Badges } from "../../packages/tansu";
import type { Proposal as ModifiedProposal } from "types/proposal";
import { checkSimulationError } from "utils/contractErrors";
import { fetchWithCache, invalidateQuery } from "./cache/cacheStore";
import { queryKeys } from "./cache/cacheKeys";

const TTL_4H = 4 * 60 * 60 * 1000;
const TTL_1H = 60 * 60 * 1000;

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

  return await fetchWithCache(
    queryKeys.project.hash(projectKey.toString("hex")),
    async () => {
      const res = await Tansu.get_commit({
        project_key: projectKey,
      });

      // Check for simulation errors
      checkSimulationError(res);

      return res.result;
    },
    { ttlMs: TTL_4H },
  ).catch(() => null);
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

  return await fetchWithCache(
    queryKeys.project.byId(projectKey.toString("hex")),
    async () => {
      const res = await Tansu.get_project({
        project_key: projectKey,
      });

      // Check for simulation errors
      checkSimulationError(res);

      return res.result;
    },
    { ttlMs: TTL_4H },
  ).catch(() => null);
}

async function getProjectFromName(
  projectName: string,
): Promise<Project | null> {
  // Skip if project name is empty
  if (!projectName || projectName.trim() === "") {
    return null;
  }

  const projectId = deriveProjectKey(projectName);

  return await fetchWithCache(
    queryKeys.project.byId(projectId.toString("hex")),
    async () => {
      const res = await Tansu.get_project({
        project_key: projectId,
      });

      // Check for simulation errors
      checkSimulationError(res);

      return res.result;
    },
    { ttlMs: TTL_4H },
  ).catch(() => null);
}

async function getProjectFromId(projectId: Buffer): Promise<Project | null> {
  return await fetchWithCache(
    queryKeys.project.byId(projectId.toString("hex")),
    async () => {
      const res = await Tansu.get_project({
        project_key: projectId,
      });

      // Check for simulation errors
      checkSimulationError(res);

      return res.result;
    },
    { ttlMs: TTL_4H },
  ).catch(() => null);
}

async function getProposalPages(project_name: string): Promise<number | null> {
  return await fetchWithCache(
    queryKeys.proposals.pages(project_name),
    async () => {
      const project_key = deriveProjectKey(project_name);

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

      return low + 1;
    },
    { ttlMs: TTL_4H },
  ).catch(() => null);
}

async function getProposals(
  project_name: string,
  page: number,
): Promise<ModifiedProposal[] | null> {
  return await fetchWithCache(
    queryKeys.proposals.list(project_name, page),
    async () => {
      const project_key = deriveProjectKey(project_name);

      // Try get_dao first (fast path for projects without outcome_contracts issues).
      // get_dao may fail with an XDR decode error in @stellar/stellar-sdk v16 when
      // proposals have OutcomeContract.args that use Vec<scSpecTypeVal>
      // (GitHub issue #1178). Fall back to individual get_proposal calls.
      try {
        const res = await Tansu.get_dao({
          project_key: project_key,
          page: page,
        });

        // Check for simulation errors
        checkSimulationError(res);

        return (res.result.proposals as Proposal[]).map((proposal) =>
          modifyProposalFromContract(proposal),
        );
      } catch {
        // get_dao failed — likely an XDR decode error for proposals with
        // outcome_contracts args. Fall back to fetching each proposal
        // individually via get_proposal, skipping any that also fail.
        const MAX_PER_PAGE = 9;
        const proposals: ModifiedProposal[] = [];
        const startId = page * MAX_PER_PAGE;
        const endId = startId + MAX_PER_PAGE;

        for (let proposalId = startId; proposalId < endId; proposalId++) {
          try {
            const raw = await getProposalRaw(project_name, proposalId);
            if (!raw) continue;
            const modified = modifyProposalFromContract(raw);
            proposals.push(modified);
          } catch {
            // Skip proposals whose data can't be decoded.
            continue;
          }
        }

        return proposals;
      }
    },
    { ttlMs: TTL_4H },
  ).catch(() => null);
}

async function getProposalRaw(
  projectName: string,
  proposalId: number,
): Promise<Proposal | null> {
  try {
    const project_key = deriveProjectKey(projectName);
    const res = await Tansu.get_proposal({
      project_key: project_key,
      proposal_id: proposalId,
    });

    // Check for simulation errors
    checkSimulationError(res);

    return res.result as Proposal;
  } catch {
    return null;
  }
}

async function getProposal(
  projectName: string,
  proposalId: number,
): Promise<ModifiedProposal | null> {
  const proposal = await getProposalRaw(projectName, proposalId);
  if (!proposal) return null;

  return await fetchWithCache(
    queryKeys.proposal.detail(projectName, proposalId),
    async () => modifyProposalFromContract(proposal),
    { ttlMs: TTL_1H },
  );
}

async function getMember(memberAddress: string): Promise<Member | null> {
  // Skip if address is empty
  if (!memberAddress || memberAddress.trim() === "") {
    return null;
  }

  return await fetchWithCache(
    queryKeys.membership.detail(memberAddress),
    async () => {
      const res = await Tansu.get_member({
        member_address: memberAddress,
      });

      // Check for simulation errors
      checkSimulationError(res);

      return res.result;
    },
    { ttlMs: TTL_4H },
  ).catch(() => null);
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
  return await fetchWithCache(
    queryKeys.projects.page(page),
    async () => {
      const res = await Tansu.get_projects({ page });
      checkSimulationError(res);
      return res.result || [];
    },
    { ttlMs: TTL_4H },
  ).catch(() => []);
}

/**
 * Invalidate all cached data for a specific proposal and its project's list caches.
 * Call this after any mutation (vote, execute) to prevent stale reads before TTL expiry.
 */
function invalidateProposalCache(
  project_name: string,
  proposal_id: number,
): void {
  invalidateQuery(queryKeys.proposal.raw(project_name, proposal_id));
  invalidateQuery(queryKeys.proposal.detail(project_name, proposal_id));
  invalidateQuery(queryKeys.proposals.all(project_name));
  invalidateQuery(queryKeys.proposals.pages(project_name));
}

export {
  getProject,
  getProjectHash,
  getProjectFromName,
  getProjectFromId,
  getProposalPages,
  getProposals,
  getProposalRaw,
  getProposal,
  getMember,
  getBadges,
  getProjectsPage,
  invalidateProposalCache,
};

/**
 * Read the conflict-of-interest list for a proposal.
 * Errors propagate to the caller so a failed contract read is not
 * indistinguishable from an empty list.
 */
export async function getConflictOfInterest(
  projectName: string,
  proposalId: number,
): Promise<string[]> {
  const project_key = deriveProjectKey(projectName);
  const tx = await Tansu.get_conflict_of_interest({
    project_key,
    proposal_id: Number(proposalId),
  });
  checkSimulationError(tx);
  return tx.result || [];
}

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
