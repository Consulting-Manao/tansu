import { queryOptions } from "@tanstack/react-query";
import { getIpfsBasicLink, ipfsQuery } from "utils/ipfsFunctions";
import type { Proposal, ProposalOutcome } from "types/proposal";
import type { Proposal as ContractProposal } from "../../packages/tansu";
import { tansuReads } from "../contracts/soroban_tansu";
import { readResult } from "../utils/contractErrors";
import { deriveProjectKey, projectKeyHex } from "../utils/projectKey";
import { queryClient } from "./queryClient";

const MINUTE = 60_000;
/** The contract's MAX_PROPOSALS_PER_PAGE: proposal `id` is on page `id / 9`. */
const PROPOSALS_PER_PAGE = 9;

/**
 * How many proposals a project has: their ids run from 0 to count - 1.
 *
 * Pages fill in order, so the count comes from the last page that is not
 * empty, found by doubling then bisecting.
 */
export const proposalCountQuery = (name: string) =>
  queryOptions({
    queryKey: ["proposals", projectKeyHex(name)],
    queryFn: async () => {
      const project_key = deriveProjectKey(name);
      const sizes = new Map<number, number>();
      const size = async (page: number) => {
        if (!sizes.has(page)) {
          const dao = readResult(
            await tansuReads.get_dao({ project_key, page }),
            200,
            301,
          );
          sizes.set(page, dao?.proposals.length ?? 0);
        }
        return sizes.get(page)!;
      };
      if (!(await size(0))) return 0;
      let [full, empty] = [0, 1];
      while (await size(empty)) [full, empty] = [empty, empty * 2];
      while (empty - full > 1) {
        const middle = Math.floor((full + empty) / 2);
        if (await size(middle)) full = middle;
        else empty = middle;
      }
      return full * PROPOSALS_PER_PAGE + (await size(full));
    },
    staleTime: MINUTE,
  });

/** A proposal with its votes; `null` when the project has no such id. */
export const proposalQuery = (name: string, id: number) =>
  queryOptions({
    queryKey: ["proposal", projectKeyHex(name), id],
    queryFn: async () =>
      readResult(
        await tansuReads.get_proposal({
          project_key: deriveProjectKey(name),
          proposal_id: id,
        }),
        301,
      ),
    staleTime: MINUTE,
  });

/** Combines proposal queries for `useQueries`: the loaded ones, in order. */
export const loadedProposals = (
  reads: { data: ContractProposal | null | undefined; isLoading: boolean }[],
) => ({
  proposals: reads.flatMap(({ data }) => (data ? [data] : [])),
  isLoading: reads.some(({ isLoading }) => isLoading),
});

/** The addresses that may not vote on a proposal. */
export const conflictsQuery = (name: string, id: number) =>
  queryOptions({
    queryKey: ["conflicts", projectKeyHex(name), id],
    queryFn: async () =>
      readResult(
        await tansuReads.get_conflict_of_interest({
          project_key: deriveProjectKey(name),
          proposal_id: id,
        }),
      ),
    staleTime: MINUTE,
  });

const PROPOSAL_MD_PATH = "/proposal.md";
const OUTCOMES_JSON_PATH = "/outcomes.json";
const DISCUSSION_MD_PATH = "/proposal_discussion.md";
const DISCUSSION_SUMMARY_PATH = "/summary.md";

/** A file of a proposal's IPFS directory; `null` when it cannot be read. */
const readIpfsFile = (cid: string, path: string) =>
  queryClient.query(ipfsQuery(cid, path)).catch(() => null);

function imagePaths(content: string, cid: string): string {
  const basicUrl = getIpfsBasicLink(cid);
  if (!basicUrl) return content;
  return content.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, path) => {
    if (path.startsWith("http://") || path.startsWith("https://")) {
      return match;
    }
    return `![${alt}](${basicUrl}/${path})`;
  });
}

/**
 * Fetches proposal markdown content from IPFS
 *
 * @param cid - The IPFS CID
 * @returns The markdown content with image paths corrected, or null if not found
 */
async function fetchProposalFromIPFS(cid: string) {
  try {
    const content = await readIpfsFile(cid, PROPOSAL_MD_PATH);
    if (!content) return null;
    return imagePaths(content, cid);
  } catch {
    return null;
  }
}

/** Seam for where discussion docs live; defaults to the proposal's IPFS dir. */
export function resolveDiscussionCid(proposal: Proposal): string | null {
  return proposal.discussionIpfs?.trim() || proposal.ipfs?.trim() || null;
}

/** Fetches the discussion thread (proposal_discussion.md) from IPFS. */
export async function fetchProposalDiscussionFromIPFS(
  cid: string,
): Promise<string | null> {
  try {
    const content = await readIpfsFile(cid, DISCUSSION_MD_PATH);
    if (!content?.trim()) return null;
    return imagePaths(content, cid);
  } catch {
    return null;
  }
}

/** Fetches the optional discussion summary (summary.md) from IPFS. */
export async function fetchProposalDiscussionSummaryFromIPFS(
  cid: string,
): Promise<string | null> {
  try {
    const content = await readIpfsFile(cid, DISCUSSION_SUMMARY_PATH);
    if (!content?.trim()) return null;
    return imagePaths(content, cid);
  } catch {
    return null;
  }
}

/**
 * Normalizes the stored outcomes.json into the flat display shape consumed by
 * the UI. Handles both the tree-shaped format (all outcomes under a single
 * `outcomes` root, each with an optional `execution` subtree) and the legacy
 * flat format (top-level approved/rejected/cancelled with xdr/contract).
 */
export function normalizeOutcomeData(raw: unknown): ProposalOutcome {
  const result: ProposalOutcome = {};
  if (!raw || typeof raw !== "object") return result;

  const data = raw as Record<string, any>;
  const tree = data.outcomes as Record<string, any> | undefined;

  const outcomeTypes = ["approved", "rejected", "cancelled"] as const;

  for (const type of outcomeTypes) {
    const node = tree?.[type] ?? data[type];
    if (!node || typeof node !== "object") continue;

    const normalized: ProposalOutcome[typeof type] = {
      description: node.description ?? "",
    };

    if (node.execution) {
      // Tree format: execution subtree.
      if (node.execution.xdr) normalized.xdr = node.execution.xdr;
      if (node.execution.contract)
        normalized.contract = node.execution.contract;
    } else {
      // Legacy flat format: xdr/contract sit directly on the node.
      if (node.xdr) normalized.xdr = node.xdr;
      if (node.contract) normalized.contract = node.contract;
    }

    result[type] = normalized;
  }

  return result;
}

/**
 * Fetches proposal outcome data with precedence: contract outcomes take precedence over XDR
 *
 * @param proposal - The proposal object
 * @returns The outcome data (always an object; may be empty so UI can show all three sections)
 */
export async function fetchProposalOutcomeData(
  proposal: Proposal,
): Promise<ProposalOutcome> {
  let outcomeData: ProposalOutcome = {};

  // Load IPFS data first (for descriptions and XDR)
  if (proposal.ipfs) {
    try {
      const text = await readIpfsFile(proposal.ipfs, OUTCOMES_JSON_PATH);
      if (text) {
        outcomeData = normalizeOutcomeData(JSON.parse(text));
      }
    } catch (error) {
      console.warn("Failed to load IPFS outcome data:", error);
    }
  }

  // Merge with onchain contract data
  if (proposal.outcome_contracts && proposal.outcome_contracts.length > 0) {
    const [approved, rejected, cancelled] = proposal.outcome_contracts;

    if (approved && approved.address) {
      outcomeData.approved = {
        description:
          outcomeData.approved?.description ??
          `Contract execution: ${approved.execute_fn}`,
        ...outcomeData.approved,
        contract: approved,
      };
    }
    if (rejected && rejected.address) {
      outcomeData.rejected = {
        description:
          outcomeData.rejected?.description ??
          `Contract execution: ${rejected.execute_fn}`,
        ...outcomeData.rejected,
        contract: rejected,
      };
    }
    if (cancelled && cancelled.address) {
      outcomeData.cancelled = {
        description:
          outcomeData.cancelled?.description ??
          `Contract execution: ${cancelled.execute_fn}`,
        ...outcomeData.cancelled,
        contract: cancelled,
      };
    }
  }

  // Always return the outcome object so the UI can show all three sections (approved, rejected, cancelled)
  return outcomeData;
}

export { fetchProposalFromIPFS };
