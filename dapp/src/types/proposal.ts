export type ProposalStatus =
  | "active"
  | "rejected"
  | "cancelled"
  | "approved"
  | "malicious";

export type ProposalViewStatus =
  | "active"
  | "rejected"
  | "cancelled"
  | "voted"
  | "approved"
  | "malicious";

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

export type VoterRole = "maintainer" | "community";

export interface VoteStatus {
  approve: VoteData;
  reject: VoteData;
  abstain: VoteData;
}

export interface VoteData {
  voteType: VoteType;
  score: number;
  voters: Voter[];
}

export interface Voter {
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
