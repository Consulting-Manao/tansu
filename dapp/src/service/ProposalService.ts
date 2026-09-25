import { queryOptions } from "@tanstack/react-query";
import { Buffer } from "buffer";
import { ipfsQuery } from "utils/ipfsFunctions";
import type {
  OutcomeContract,
  Proposal,
  ProposalOutcome,
  VoteReceipt,
  VoteType,
} from "types/proposal";
import type {
  Proposal as ContractProposal,
  Vote,
  VoteChoice,
} from "../../packages/tansu";
import { tansuFor, tansuReads } from "../contracts/soroban_tansu";
import { errorMessage, readResult } from "../utils/contractErrors";
import { randomSeed } from "../utils/anonymousVoting";
import { encryptWithPublicKey } from "../utils/crypto";
import { deriveProjectKey, projectKeyHex } from "../utils/projectKey";
import { parseContractOptionString } from "../utils/utils";
import { votingPowerQuery } from "./MemberService";
import { anonymousConfigQuery } from "./ProjectService";
import { queryClient } from "./queryClient";
import { isNoCall } from "./ContractIntrospectionService";
import { OUTCOMES } from "../utils/proposalOutcomes";
import {
  getTokenBalance,
  tokenVoteWeightToContract,
} from "./TokenBalanceService";
import { packUpload, sendTransaction } from "./TxService";
import { connectedAddress } from "./walletService";

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

/** The proposal's description, proposal.md; `null` when it cannot be read. */
const fetchProposalFromIPFS = (cid: string) =>
  readIpfsFile(cid, PROPOSAL_MD_PATH);

/** Seam for where discussion docs live; defaults to the proposal's IPFS dir. */
export function resolveDiscussionCid(proposal: Proposal): string | null {
  return proposal.discussionIpfs?.trim() || proposal.ipfs?.trim() || null;
}

/** The discussion thread, proposal_discussion.md; `null` when empty. */
export async function fetchProposalDiscussionFromIPFS(
  cid: string,
): Promise<string | null> {
  const content = await readIpfsFile(cid, DISCUSSION_MD_PATH);
  return content?.trim() ? content : null;
}

/** The discussion's optional summary, summary.md; `null` when empty. */
export async function fetchProposalDiscussionSummaryFromIPFS(
  cid: string,
): Promise<string | null> {
  const content = await readIpfsFile(cid, DISCUSSION_SUMMARY_PATH);
  return content?.trim() ? content : null;
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

  // What executes is on chain: each slot's call, except the filler of a gap.
  // A call only outcomes.json names never runs, so it is not shown.
  OUTCOMES.forEach((kind, slot) => {
    const call = proposal.outcome_contracts?.[slot];
    const node = outcomeData[kind];
    if (call && !isNoCall(call)) {
      outcomeData[kind] = {
        description:
          node?.description ?? `Contract execution: ${call.execute_fn}`,
        ...node,
        contract: call,
      };
    } else if (node?.contract) {
      const { contract: _offChain, ...rest } = node;
      outcomeData[kind] = rest;
    }
  });

  // Always return the outcome object so the UI can show all three sections (approved, rejected, cancelled)
  return outcomeData;
}

export { fetchProposalFromIPFS };

/** The queries a change to a proposal refetches. */
const proposalKey = (name: string, id: number) => [
  "proposal",
  projectKeyHex(name),
  id,
];

/**
 * Submit a proposal: its description and outcomes on IPFS, the vote on
 * chain. Returns the new proposal's id and its IPFS directory.
 */
export async function createProposal({
  projectName,
  proposalName,
  proposalFiles,
  votingEndsAt,
  publicVoting = true,
  outcomeContracts,
  tokenContract,
  onProgress,
}: {
  projectName: string;
  proposalName: string;
  proposalFiles: File[];
  votingEndsAt: number;
  publicVoting?: boolean;
  /** Contracts to call on execution: approved, rejected, cancelled. */
  outcomeContracts?: OutcomeContract[] | undefined;
  /** A token for token-weighted voting (its SAC address). */
  tokenContract?: string | undefined;
  onProgress?: (step: number) => void;
}): Promise<{ id: number; cid: string }> {
  const upload = await packUpload(proposalFiles);
  onProgress?.(7);
  const address = connectedAddress();
  const tx = await tansuFor(address).create_proposal({
    proposer: address,
    project_key: deriveProjectKey(projectName),
    title: proposalName,
    ipfs: upload.cid,
    voting_ends_at: BigInt(votingEndsAt),
    public_voting: publicVoting,
    outcome_contracts: outcomeContracts,
    token_contract: tokenContract,
  });
  const { result } = await sendTransaction(tx, {
    upload,
    onProgress,
    invalidate: [["proposals", projectKeyHex(projectName)]],
  });
  return { id: result, cid: upload.cid };
}

export interface VotingPowerResult {
  maxWeight: number;
  isTokenVoting: boolean;
  tokenContract: string | null;
  /** Whole-token balance from SAC (for display). */
  tokenBalance?: number;
  tokenDecimals?: number;
}

/**
 * The weight a voter may use: their token balance for a token-weighted
 * proposal, their badges' weight otherwise.
 */
export async function getVotingPower(
  projectName: string,
  proposalId: number,
  voterAddress?: string,
): Promise<VotingPowerResult> {
  const member = voterAddress ?? connectedAddress();
  const proposal = await queryClient.query(
    proposalQuery(projectName, proposalId),
  );
  if (!proposal) throw new Error("Proposal not found");

  const tokenContract = parseContractOptionString(
    proposal.vote_data.token_contract,
  );
  if (tokenContract) {
    const tokenBalance = await getTokenBalance(tokenContract, member);
    return {
      maxWeight: tokenBalance.maxVoteWeight,
      isTokenVoting: true,
      tokenContract,
      tokenBalance: tokenBalance.balanceInTokens,
      tokenDecimals: tokenBalance.decimals,
    };
  }

  const maxWeight = await queryClient.query(
    votingPowerQuery(projectName, member),
  );
  return { maxWeight, isTokenVoting: false, tokenContract: null };
}

const VOTE_CHOICES: Record<VoteType, VoteChoice> = {
  approve: { tag: "Approve", values: undefined },
  reject: { tag: "Reject", values: undefined },
  abstain: { tag: "Abstain", values: undefined },
};

/**
 * Vote on a proposal, publicly or anonymously as the proposal says. The
 * receipt holds what an anonymous voter keeps to prove their vote later.
 */
export async function vote(
  projectName: string,
  proposalId: number,
  voteType: VoteType,
  customWeight?: number,
): Promise<VoteReceipt> {
  const voter = connectedAddress();
  const project_key = deriveProjectKey(projectName);

  const proposal = await queryClient.query(
    proposalQuery(projectName, proposalId),
  );
  if (!proposal) throw new Error("Proposal not found");
  const isPublicVoting = proposal.vote_data.public_voting;
  const tokenContract = parseContractOptionString(
    proposal.vote_data.token_contract,
  );

  // Badges: a u32 badge weight. Token: u32 whole-token units, which the
  // contract checks against the balance.
  let weight: number;
  if (tokenContract) {
    const tokenBalance = await getTokenBalance(tokenContract, voter);
    weight = tokenVoteWeightToContract(
      customWeight ??
        (tokenBalance.maxVoteWeight > 0 ? tokenBalance.maxVoteWeight : 1),
    );
    if (weight <= 0) throw new Error("Vote weight must be greater than zero");
  } else if (customWeight !== undefined) {
    weight = customWeight;
  } else {
    const maxWeight = await queryClient
      .query(votingPowerQuery(projectName, voter))
      .catch(() => 0);
    weight = maxWeight > 0 ? maxWeight : 1;
  }

  let payload: Vote;
  let receipt: Pick<
    VoteReceipt,
    "seeds" | "votes" | "commitments" | "publicKey"
  > = {};
  if (isPublicVoting) {
    payload = {
      tag: "PublicVote",
      values: [{ address: voter, vote_choice: VOTE_CHOICES[voteType], weight }],
    };
  } else {
    // Commitments are built from the raw votes and seeds, without weights:
    // the contract applies the weight, so the chosen option is 1 and the
    // others 0, which keeps later tallies within u32.
    const votes = [0, 0, 0];
    votes[["approve", "reject", "abstain"].indexOf(voteType)] = 1;
    const seeds = [randomSeed(), randomSeed(), randomSeed()];

    // The key in use now: a cached one may have been replaced.
    const config = await queryClient.query({
      ...anonymousConfigQuery(projectName),
      staleTime: 0,
    });
    const publicKey = config?.public_key;
    if (!publicKey) {
      throw new Error("Anonymous voting config missing public key");
    }
    const saltPrefix = `${voter}:${projectName}:${proposalId}`;

    try {
      const [encryptedSeeds, encryptedVotes, commitmentsTx] = await Promise.all(
        [
          Promise.all(
            seeds.map((seed) =>
              encryptWithPublicKey(`${saltPrefix}:${seed}`, publicKey),
            ),
          ),
          Promise.all(
            votes.map((v) =>
              encryptWithPublicKey(`${saltPrefix}:${v}`, publicKey),
            ),
          ),
          tansuReads.build_commitments_from_votes({
            project_key,
            votes: votes.map(BigInt),
            seeds,
          }),
        ],
      );
      const commitments = readResult(commitmentsTx);
      receipt = {
        seeds: seeds.map(String),
        votes: votes.map(String),
        commitments: commitments.map((c) => Buffer.from(c).toString("hex")),
        publicKey,
      };
      payload = {
        tag: "AnonymousVote",
        values: [
          {
            address: voter,
            weight,
            encrypted_seeds: encryptedSeeds,
            encrypted_votes: encryptedVotes,
            commitments,
          },
        ],
      };
    } catch (error) {
      throw new Error(errorMessage(error), { cause: error });
    }
  }

  const tx = await tansuFor(voter).vote({
    voter,
    project_key,
    proposal_id: proposalId,
    vote: payload,
  });
  const { hash } = await sendTransaction(tx, {
    invalidate: [proposalKey(projectName, proposalId)],
  });
  return {
    projectName,
    proposalId,
    voteType,
    weight,
    isPublicVoting,
    transactionHash: hash,
    ...receipt,
  };
}

/**
 * Close a proposal whose vote ended. An anonymous one needs the tallies and
 * seeds its maintainers decoded.
 */
export async function executeProposal(
  projectName: string,
  proposalId: number,
  tallies?: bigint[],
  seeds?: bigint[],
): Promise<void> {
  const maintainer = connectedAddress();
  const tx = await tansuFor(maintainer).execute({
    maintainer,
    project_key: deriveProjectKey(projectName),
    proposal_id: proposalId,
    tallies,
    seeds,
  });
  await sendTransaction(tx, {
    invalidate: [proposalKey(projectName, proposalId)],
  });
}

/** Revoke a proposal as malicious. */
export async function revokeProposal(
  projectName: string,
  proposalId: number,
): Promise<void> {
  const maintainer = connectedAddress();
  const tx = await tansuFor(maintainer).revoke_proposal({
    maintainer,
    project_key: deriveProjectKey(projectName),
    proposal_id: proposalId,
  });
  await sendTransaction(tx, {
    invalidate: [proposalKey(projectName, proposalId)],
  });
}

/** Remove a malicious vote from a proposal. */
export async function removeVote(
  projectName: string,
  proposalId: number,
  voterAddress: string,
): Promise<void> {
  const maintainer = connectedAddress();
  const tx = await tansuFor(maintainer).remove_vote({
    maintainer,
    project_key: deriveProjectKey(projectName),
    proposal_id: proposalId,
    voter: voterAddress,
  });
  await sendTransaction(tx, {
    invalidate: [proposalKey(projectName, proposalId)],
  });
}

/** Add addresses to, or remove them from, those who may not vote. */
export async function changeConflictOfInterest(
  change: "add" | "remove",
  projectName: string,
  proposalId: number,
  addresses: string[],
): Promise<void> {
  const maintainer = connectedAddress();
  const args = {
    maintainer,
    project_key: deriveProjectKey(projectName),
    proposal_id: proposalId,
    addresses,
  };
  const client = tansuFor(maintainer);
  const tx = await (change === "add"
    ? client.add_conflict_of_interest(args)
    : client.remove_conflict_of_interest(args));
  await sendTransaction(tx, {
    invalidate: [["conflicts", projectKeyHex(projectName), proposalId]],
  });
}

/**
 * Give the project the key anonymous votes are encrypted to. An existing key
 * is only replaced when asked: open anonymous proposals stay with it.
 */
export async function setupAnonymousVoting(
  projectName: string,
  publicKey: string,
  replace = false,
): Promise<void> {
  if (!replace) {
    const config = await queryClient.query({
      ...anonymousConfigQuery(projectName),
      staleTime: 0,
    });
    if (config) {
      throw new Error("This project already has an anonymous voting key.");
    }
  }
  const maintainer = connectedAddress();
  const tx = await tansuFor(maintainer).anonymous_voting_setup({
    maintainer,
    project_key: deriveProjectKey(projectName),
    public_key: publicKey,
  });
  await sendTransaction(tx, {
    invalidate: [["anonymousConfig", projectKeyHex(projectName)]],
  });
}
