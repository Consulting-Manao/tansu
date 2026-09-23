export type ProposalStatus =
  "active" | "rejected" | "cancelled" | "approved" | "malicious";

export type ProposalViewStatus =
  "active" | "rejected" | "cancelled" | "voted" | "approved" | "malicious";

export interface OutcomeContract {
  address: string;
  execute_fn: string;
  args: any[];
}

export interface Proposal {
  id: number;
  title: string;
  ipfs: string;
  proposer: string;
  publicVoting: boolean;
  status: ProposalStatus;
  voting_ends_at: number;
  voteStatus: VoteStatus;
  outcome_contracts?: OutcomeContract[] | null; // Array of [approved, rejected, cancelled] contracts
  /** Set when proposal uses token-weighted voting (SAC contract address). */
  tokenContract?: string | null;
  discussionIpfs?: string | null;
}

export interface ProposalView {
  id: number;
  title: string;
  proposer: string;
  projectName: string;
  publicVoting: boolean;
  ipfsLink: string;
  status: ProposalViewStatus;
  endDate: number;
  voteStatus: VoteStatus;
  tokenContract?: string | null;
}

export enum VoteType {
  APPROVE = "approve",
  REJECT = "reject",
  CANCEL = "abstain",
}

export enum VoteResultType {
  APPROVE = "approved",
  REJECT = "rejected",
  CANCEL = "cancelled",
}

export interface VoteStatus {
  approve: VoteData;
  reject: VoteData;
  abstain: VoteData;
}

interface VoteData {
  voteType: VoteType;
  score: number;
  voters: Voter[];
}

interface Voter {
  address: string;
  image: string | null;
  name: string;
  github: string;
}

export interface ProposalOutcome {
  approved?: {
    description: string;
    xdr?: string; // Optional for backward compatibility
    contract?: OutcomeContract; // New contract-based outcome
  };
  rejected?: {
    description: string;
    xdr?: string; // Optional for backward compatibility
    contract?: OutcomeContract; // New contract-based outcome
  };
  cancelled?: {
    description: string;
    xdr?: string; // Optional for backward compatibility
    contract?: OutcomeContract; // New contract-based outcome
  };
}

export interface VoteReceipt {
  projectName: string;
  proposalId: number;
  voteType: string;
  weight: number;
  isPublicVoting: boolean;
  transactionHash?: string;
  seeds?: string[];
  votes?: string[];
  commitments?: string[];
  publicKey?: string;
}

/**
 * Execution payload for an outcome (XDR transaction or contract call).
 * Stored inside each outcome node of the tree-shaped outcomes.json.
 */
interface StoredOutcomeExecution {
  type: "xdr" | "contract";
  xdr?: string;
  contract?: OutcomeContract;
}

/** A single outcome node in the tree-shaped outcomes.json format. */
export interface StoredOutcomeNode {
  description: string;
  execution?: StoredOutcomeExecution;
}

/**
 * Tree-shaped outcomes.json format.
 *
 * All outcomes live under a single `outcomes` root so the file has one
 * uniform, nested structure (approved / rejected / cancelled are siblings
 * under the same tree) instead of a flat top-level object. Each node holds
 * the description plus an optional `execution` subtree (XDR or contract).
 */
export interface StoredProposalOutcome {
  outcomes: {
    approved?: StoredOutcomeNode;
    rejected?: StoredOutcomeNode;
    cancelled?: StoredOutcomeNode;
  };
}
