import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}

export interface Dao {
  proposals: Array<Proposal>;
}

export type Vote =
  | { tag: "PublicVote"; values: readonly [PublicVote] }
  | { tag: "AnonymousVote"; values: readonly [AnonymousVote] };

export enum Badge {
  Developer = 10000000,
  Triage = 5000000,
  Community = 1000000,
  Verified = 500000,
  Default = 1,
}

export interface Badges {
  community: Array<string>;
  developer: Array<string>;
  triage: Array<string>;
  verified: Array<string>;
}

export interface Config {
  ipfs: string;
  url: string;
}

export interface Member {
  git_identity: Option<string>;
  git_pubkey: Option<Buffer>;
  meta: string;
  projects: Array<ProjectBadges>;
}

export interface Project {
  config: Config;
  maintainers: Array<string>;
  name: string;
  sub_projects: Option<Array<Buffer>>;
}

export interface Evidence {
  cid: string;
  created_at: u64;
}

export interface Proposal {
  id: u32;
  ipfs: string;
  outcome_contracts: Option<Array<OutcomeContract>>;
  proposer: string;
  status: ProposalStatus;
  title: string;
  vote_data: VoteData;
}

export interface VoteData {
  public_voting: boolean;
  token_contract: Option<string>;
  votes: Array<Vote>;
  voting_ends_at: u64;
}

export interface PublicVote {
  address: string;
  vote_choice: VoteChoice;
  weight: u32;
}

export type VoteChoice =
  | { tag: "Approve"; values: void }
  | { tag: "Reject"; values: void }
  | { tag: "Abstain"; values: void };

export interface Attestation {
  attester: string;
  created_at: u64;
  note: Option<string>;
  weight: u32;
}

export interface ContractRef {
  address: string;
  wasm_hash: Option<Buffer>;
}

export interface AdminsConfig {
  admins: Array<string>;
  threshold: u32;
}

export type EvidenceKind =
  | { tag: "Sbom"; values: void }
  | { tag: "Cve"; values: void }
  | { tag: "Attestation"; values: void };

export interface AnonymousVote {
  address: string;
  commitments: Array<Buffer>;
  encrypted_seeds: Array<string>;
  encrypted_votes: Array<string>;
  weight: u32;
}

export interface ProjectBadges {
  badges: Array<Badge>;
  project: Buffer;
}

export interface FinalityStatus {
  attested: u32;
  finalized_at: Option<u64>;
  is_final: boolean;
  total: u32;
}

export type ProposalStatus =
  | { tag: "Active"; values: void }
  | { tag: "Approved"; values: void }
  | { tag: "Rejected"; values: void }
  | { tag: "Cancelled"; values: void }
  | { tag: "Malicious"; values: void };

export interface OutcomeContract {
  address: string;
  args: Array<any>;
  execute_fn: string;
}

export interface UpgradeProposal {
  admins_config: AdminsConfig;
  approvals: Array<string>;
  executable_at: u64;
  wasm_hash: Buffer;
}

export type AttestationTarget =
  | { tag: "Commit"; values: void }
  | { tag: "Evidence"; values: readonly [EvidenceKind, string] };

export interface AnonymousVoteConfig {
  public_key: string;
  seed_generator_point: Buffer;
  vote_generator_point: Buffer;
}

export const ContractErrors = {
  0: { message: "UnexpectedError" },
  100: { message: "UnauthorizedSigner" },
  101: { message: "WrongVoter" },
  103: { message: "MissingMaintainer" },
  200: { message: "InvalidKey" },
  201: { message: "ProjectAlreadyExist" },
  202: { message: "TooManySubProjects" },
  203: { message: "ProposalInputValidation" },
  204: { message: "UnknownMember" },
  205: { message: "MemberAlreadyExist" },
  206: { message: "InvalidProjectName" },
  207: { message: "WrongVoteType" },
  208: { message: "BadCommitment" },
  209: { message: "VoterWeight" },
  210: { message: "VoteLimitExceeded" },
  211: { message: "VoterConflicted" },
  212: { message: "InvalidEvidence" },
  213: { message: "InvalidCommitHash" },
  214: { message: "InvalidVotingPeriod" },
  215: { message: "InvalidAttestation" },
  216: { message: "InvalidAttestationThreshold" },
  217: { message: "AlreadyAttested" },
  218: { message: "TooManyMaintainers" },
  219: { message: "DuplicateMaintainer" },
  220: { message: "TooManyAttestations" },
  221: { message: "AttestationNotFound" },
  222: { message: "AttestationFinalized" },
  223: { message: "AttestationRevocationExpired" },
  224: { message: "InvalidBadges" },
  225: { message: "InvalidProjectConfig" },
  300: { message: "NoHashFound" },
  301: { message: "NoProposalorPageFound" },
  302: { message: "NoProjectPageFound" },
  303: { message: "NoAnonymousVotingConfig" },
  400: { message: "AlreadyVoted" },
  401: { message: "ProposalVotingTime" },
  402: { message: "ProposalActive" },
  403: { message: "OutcomeError" },
  404: { message: "VoteNotFound" },
  500: { message: "TallySeedError" },
  501: { message: "InvalidProof" },
  600: { message: "ContractPaused" },
  601: { message: "UpgradeError" },
  602: { message: "ContractValidation" },
  603: { message: "CollateralError" },
  700: { message: "InvalidGitIdentity" },
};

export interface Client {
  /**
   * Construct and simulate a vote transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Cast a vote on a proposal.
   *
   * Allows a member to vote on a proposal.
   * The vote can be either public or anonymous depending on the proposal configuration.
   * For public votes, the choice and weight are visible. For anonymous votes, only
   * the weight is visible, and the choice is encrypted.
   *
   * Badge-based proposals cap weight by membership badges. Token-based
   * proposals require `weight` (whole tokens) not to exceed the voter's
   * current token balance. Votes of weight 1 take at most
   * `MAX_DEFAULT_WEIGHT_VOTES` of the `MAX_VOTES_PER_PROPOSAL` slots.
   *
   * # Arguments
   * * `env` - The environment object
   * * `voter` - The address of the voter
   * * `project_key` - The project key identifier
   * * `proposal_id` - The ID of the proposal to vote on
   * * `vote` - The vote data (public or anonymous)
   *
   * # Panics
   * * If the voter has already voted
   * * If the voting period has ended
   * * If the proposal is not active anymore
   * * If the proposal doesn't exist
   * * If the voter's weight exceeds their maximum allowed weight
   */
  vote: (
    {
      voter,
      project_key,
      proposal_id,
      vote,
    }: { voter: string; project_key: Buffer; proposal_id: u32; vote: Vote },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;

  /**
   * Construct and simulate a proof transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Verify vote commitment proof for anonymous voting.
   *
   * Validates that the provided tallies and seeds match the vote commitments
   * without revealing individual votes. This ensures the integrity of anonymous
   * voting results.
   *
   * The commitment is:
   *
   * C = g^v * h^r (in additive notation: g*v + h*r),
   *
   * where g, h are BLS12-381 generator points and v is the vote choice,
   * r is the seed. Voting weight is introduced during the tallying phase.
   *
   * # Arguments
   * * `env` - The environment object
   * * `project_key` - The project key identifier
   * * `proposal` - The proposal containing vote commitments
   * * `tallies` - Decoded tally values [approve, reject, abstain] (scaled by weights)
   * * `seeds` - Decoded seed values [approve, reject, abstain] (scaled by weights)
   *
   * # Returns
   * * `bool` - True if all commitments match the provided tallies and seeds
   *
   * Only `proposal.id` is used; the proposal is read from storage.
   *
   * # Panics
   * * If no anonymous voting configuration exists for the project
   * * If the proposal doesn't exist
   * * If `tallies` or `seeds` does not hold
   */
  proof: (
    {
      project_key,
      proposal,
      tallies,
      seeds,
    }: {
      project_key: Buffer;
      proposal: Proposal;
      tallies: Array<u128>;
      seeds: Array<u128>;
    },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<boolean>>;

  /**
   * Construct and simulate a execute transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Execute a vote after the voting period ends.
   *
   * Processes the voting results and determines the final status of the proposal.
   * For public votes, the results are calculated directly from vote counts.
   * For anonymous votes, tallies and seeds are validated against vote commitments
   * to ensure the results are correct.
   *
   * # Arguments
   * * `env` - The environment object
   * * `maintainer` - The address of the maintainer executing the proposal
   * * `project_key` - The project key identifier
   * * `proposal_id` - The ID of the proposal to execute
   * * [`Option<tallies>`] - decoded tally values (scaled by weights), respectively Approve, reject and abstain
   * * [`Option<seeds>`] - decoded seed values (scaled by weights), respectively Approve, reject and abstain
   *
   * # Returns
   * * `types::ProposalStatus` - The final status of the proposal (Approved, Rejected, or Cancelled)
   *
   * # Panics
   * * If the voting period hasn't ended
   * * If the proposal doesn't exist
   * * If the proposal is not active anymore
   * * If tallies/seeds are missing for anonymous votes
   * * If commitment
   */
  execute: (
    {
      maintainer,
      project_key,
      proposal_id,
      tallies,
      seeds,
    }: {
      maintainer: string;
      project_key: Buffer;
      proposal_id: u32;
      tallies: Option<Array<u128>>;
      seeds: Option<Array<u128>>;
    },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<ProposalStatus>>;

  /**
   * Construct and simulate a get_dao transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns a page of proposals (0 to MAX_PROPOSALS_PER_PAGE proposals per page).
   *
   * Proposal `id` is on page `id / MAX_PROPOSALS_PER_PAGE`. Revoked
   * proposals are deleted and left out, so a page can hold fewer.
   *
   * # Arguments
   * * `env` - The environment object
   * * `project_key` - The project key identifier
   * * `page` - The page number (0-based)
   *
   * # Returns
   * * `types::Dao` - The DAO object containing a page of proposals
   *
   * # Panics
   * * If the page number is out of bounds
   */
  get_dao: (
    { project_key, page }: { project_key: Buffer; page: u32 },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Dao>>;

  /**
   * Construct and simulate a remove_vote transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Remove a malicious or non-compliant vote from a proposal.
   *
   * Only a project maintainer can call this. The vote and its tally
   * contribution are dropped. The vote must be cast on an active proposal
   * (removal is allowed even after the voting period ends).
   *
   * # Arguments
   * * `env` - The environment object
   * * `maintainer` - Address of the maintainer removing the vote
   * * `project_key` - The project key identifier
   * * `proposal_id` - The ID of the proposal
   * * `voter` - The address of the voter whose vote is being removed
   *
   * # Panics
   * * If the maintainer is not authorized
   * * If the proposal is not active
   * * If no vote from the given voter exists
   */
  remove_vote: (
    {
      maintainer,
      project_key,
      proposal_id,
      voter,
    }: {
      maintainer: string;
      project_key: Buffer;
      proposal_id: u32;
      voter: string;
    },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;

  /**
   * Construct and simulate a get_proposal transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get a single proposal by ID.
   *
   * # Arguments
   * * `env` - The environment object
   * * `project_key` - The project key identifier
   * * `proposal_id` - The ID of the proposal to retrieve
   *
   * # Returns
   * * `types::Proposal` - The proposal object
   *
   * # Panics
   * * If the proposal doesn't exist
   */
  get_proposal: (
    { project_key, proposal_id }: { project_key: Buffer; proposal_id: u32 },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Proposal>>;

  /**
   * Construct and simulate a create_proposal transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Create a new proposal for a project.
   *
   * The proposer is automatically added to the abstain group.
   * By creating a proposal, the proposer incur a collateral which is
   * repaid upon execution of the proposal unless the proposal is revoked.
   * This is a deterrent mechanism.
   *
   * # Arguments
   * * `env` - The environment object
   * * `proposer` - Address of the proposal creator
   * * `project_key` - Unique identifier for the project
   * * `title` - Title of the proposal
   * * `ipfs` - IPFS content identifier describing the proposal
   * * `voting_ends_at` - UNIX timestamp when voting ends
   * * `public_voting` - Whether voting is public or anonymous
   * * [`Option<token_contract>`] - token contract for token-based voting;
   * only a maintainer sets one, and never on a project weighted by NQG
   * * [`Option<Vec<OutcomeContract>>`] - at most three outcome contracts,
   * for Approved, Rejected and Cancelled, run by the executor
   *
   * # Returns
   * * `u32` - The ID of the created proposal.
   *
   * # Panics
   * * If the title is too long
   * * If the voting period is invalid
   * * If the project doesn't
   */
  create_proposal: (
    {
      proposer,
      project_key,
      title,
      ipfs,
      voting_ends_at,
      public_voting,
      token_contract,
      outcome_contracts,
    }: {
      proposer: string;
      project_key: Buffer;
      title: string;
      ipfs: string;
      voting_ends_at: u64;
      public_voting: boolean;
      token_contract: Option<string>;
      outcome_contracts: Option<Array<OutcomeContract>>;
    },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<u32>>;

  /**
   * Construct and simulate a revoke_proposal transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Revoke a proposal.
   *
   * Useful if there was some spam or bad intent. Deletes the proposal and
   * its votes; its id stays taken. Forfeits the proposer's collateral.
   *
   * # Arguments
   * * `env` - The environment object
   * * `maintainer` - Address of the maintainer or admin revoking the proposal
   * * `project_key` - The project key identifier
   * * `proposal_id` - The ID of the proposal to revoke
   *
   * # Panics
   * * If the proposal is not active anymore
   * * If the maintainer is not authorized
   */
  revoke_proposal: (
    {
      maintainer,
      project_key,
      proposal_id,
    }: { maintainer: string; project_key: Buffer; proposal_id: u32 },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;

  /**
   * Construct and simulate a anonymous_voting_setup transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Setup anonymous voting for a project.
   *
   * Configures BLS12-381 cryptographic primitives for anonymous voting.
   *
   * # Arguments
   * * `env` - The environment object
   * * `maintainer` - The address of the maintainer (must be authorized)
   * * `project_key` - Unique identifier for the project
   * * `public_key` - Asymmetric public key to be used for vote encryption
   *
   * # Panics
   * * If the caller is not an authorized maintainer of the project
   */
  anonymous_voting_setup: (
    {
      maintainer,
      project_key,
      public_key,
    }: { maintainer: string; project_key: Buffer; public_key: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;

  /**
   * Construct and simulate a add_conflict_of_interest transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Add addresses to the conflict-of-interest list of a proposal.
   *
   * Addresses on the list cannot cast a vote on the proposal.
   *
   * # Arguments
   * * `env` - The environment object
   * * `maintainer` - A maintainer of the project (must authenticate)
   * * `project_key` - The project key identifier
   * * `proposal_id` - The ID of the proposal
   * * `addresses` - Addresses to add to the list
   *
   * # Panics
   * * If the maintainer is not authorized
   * * If the proposal is not active anymore
   */
  add_conflict_of_interest: (
    {
      maintainer,
      project_key,
      proposal_id,
      addresses,
    }: {
      maintainer: string;
      project_key: Buffer;
      proposal_id: u32;
      addresses: Array<string>;
    },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;

  /**
   * Construct and simulate a get_conflict_of_interest transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get the conflict-of-interest list for a proposal.
   *
   * # Arguments
   * * `env` - The environment object
   * * `project_key` - The project key identifier
   * * `proposal_id` - The ID of the proposal
   *
   * # Returns
   * * `Vec<Address>` - Addresses barred from voting on the proposal
   */
  get_conflict_of_interest: (
    { project_key, proposal_id }: { project_key: Buffer; proposal_id: u32 },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Array<string>>>;

  /**
   * Construct and simulate a get_anonymous_voting_config transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get the anonymous voting configuration for a project.
   *
   * # Arguments
   * * `env` - The environment object
   * * `project_key` - The project key identifier
   *
   * # Returns
   * * `types::AnonymousVoteConfig` - The anonymous voting configuration
   *
   * # Panics
   * * If no anonymous voting configuration exists for the project
   */
  get_anonymous_voting_config: (
    { project_key }: { project_key: Buffer },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<AnonymousVoteConfig>>;

  /**
   * Construct and simulate a remove_conflict_of_interest transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Remove addresses from the conflict-of-interest list of a proposal.
   *
   * # Arguments
   * * `env` - The environment object
   * * `maintainer` - A maintainer of the project (must authenticate)
   * * `project_key` - The project key identifier
   * * `proposal_id` - The ID of the proposal
   * * `addresses` - Addresses to remove from the list
   *
   * # Panics
   * * If the maintainer is not authorized
   * * If the proposal is not active anymore
   */
  remove_conflict_of_interest: (
    {
      maintainer,
      project_key,
      proposal_id,
      addresses,
    }: {
      maintainer: string;
      project_key: Buffer;
      proposal_id: u32;
      addresses: Array<string>;
    },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;

  /**
   * Construct and simulate a build_commitments_from_votes transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Build vote commitments from votes and seeds for anonymous voting.
   *
   * Creates BLS12-381 commitments for each vote using the formula:
   * C = g·vote + h·seed where g and h are generator points on BLS12-381.
   *
   * Note: This function does not consider voting weights, which are applied
   * during the tallying phase. Calling this on the smart contract would reveal
   * the votes and seeds, so it must be run either in simulation or client-side.
   *
   * # Arguments
   * * `env` - The environment object
   * * `project_key` - Unique identifier for the project
   * * `votes` - Vector of vote choices (0=approve, 1=reject, 2=abstain)
   * * `seeds` - Vector of random seeds for each vote
   *
   * # Returns
   * * `Vec<BytesN<96>>` - Vector of vote commitments (one per vote)
   *
   * # Panics
   * * If no anonymous voting configuration exists for the project
   */
  build_commitments_from_votes: (
    {
      project_key,
      votes,
      seeds,
    }: { project_key: Buffer; votes: Array<u128>; seeds: Array<u128> },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Array<Buffer>>>;

  /**
   * Construct and simulate a pause transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Pause or unpause the contract (emergency stop.)
   *
   * # Arguments
   * * `env` - The environment object
   * * `admin` - The admin address
   * * `paused` - Pause or unpause the contract operations which change
   * ledger states.
   */
  pause: (
    { admin, paused }: { admin: string; paused: boolean },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;

  /**
   * Construct and simulate a version transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get the current version of the contract.
   *
   * # Returns
   * * `u32` - The contract version number
   */
  version: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>;

  /**
   * Construct and simulate a set_executor transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Set the contract running the outcome calls of proposals.
   *
   * The executor has no upgrade: a new one is deployed and set here.
   *
   * # Arguments
   * * `env` - The environment object
   * * `admin` - The admin address
   * * `executor` - The new executor contract
   */
  set_executor: (
    { admin, executor }: { admin: string; executor: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;

  /**
   * Construct and simulate a approve_upgrade transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Approve an upgrade proposal
   *
   * # Arguments
   * * `env` - The environment object
   * * `admin` - An admin address
   *
   * # Panics
   * * If the admin is not authorized
   * * If the admin already approved
   * * If there is no upgrade to approve
   */
  approve_upgrade: (
    { admin }: { admin: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;

  /**
   * Construct and simulate a propose_upgrade transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Propose a contract upgrade.
   *
   * # Arguments
   * * `env` - The environment object
   * * `admin` - An admin address
   * * `new_wasm_hash` - The new WASM hash
   * * `new_admins_config` - Optional new admin configuration (None to keep current)
   *
   * # Panics
   * * If the admin is not authorized
   * * If there is already an existing proposal (cancel the previous first)
   */
  propose_upgrade: (
    {
      admin,
      new_wasm_hash,
      new_admins_config,
    }: {
      admin: string;
      new_wasm_hash: Buffer;
      new_admins_config: Option<AdminsConfig>;
    },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;

  /**
   * Construct and simulate a finalize_upgrade transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Execute or cancel upgrade proposal
   *
   * # Arguments
   * * `env` - The environment object
   * * `admin` - An admin address
   * * `accept` - true to accept and false to reject.
   *
   * Upgrades can always be cancelled but only executed if there are enough
   * approvals and the timelock period is over.
   * Note that current governance rules apply. New config changes only
   * in force after an update.
   *
   * # Panics
   * * If the admin is not authorized
   * * If it is too early to execute
   * * If there are not enough approvals
   * * If there is no upgrade to execute
   */
  finalize_upgrade: (
    { admin, accept }: { admin: string; accept: boolean },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;

  /**
   * Construct and simulate a get_admins_config transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get current administrators configuration.
   *
   * # Arguments
   * * `env` - The environment object
   *
   * # Returns
   * * `types::AdminsConfig` - The administrators configuration
   */
  get_admins_config: (
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<AdminsConfig>>;

  /**
   * Construct and simulate a require_not_paused transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Require that the contract is not paused, panic if it is
   *
   * # Panics
   * * If the contract is paused.
   */
  require_not_paused: (
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;

  /**
   * Construct and simulate a get_upgrade_proposal transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get upgrade proposal details
   */
  get_upgrade_proposal: (
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<UpgradeProposal>>;

  /**
   * Construct and simulate a add_member transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Add a new member to the system with metadata.
   *
   * Optionally binds a Git identity. When provided, the identity is verified
   * by checking an Ed25519 signature against the caller's address, public key,
   * and identity string. Only `git_identity` and `git_pubkey` are persisted.
   *
   * # Arguments
   * * `env` - The environment object
   * * `member_address` - The address of the member to add
   * * `meta` - Metadata string associated with the member (e.g., IPFS hash)
   * * `git_identity` - Git handle (e.g., "github:alice")
   * * `git_pubkey` - Ed25519 public key
   * * `git_sig` - Ed25519 signature
   *
   * # Panics
   * * If the member already exists
   * * If git params are incomplete (identity, key, sig must be all Some or None)
   * * If the signature verification fails
   */
  add_member: (
    {
      member_address,
      meta,
      git_identity,
      git_pubkey,
      git_sig,
    }: {
      member_address: string;
      meta: string;
      git_identity: Option<string>;
      git_pubkey: Option<Buffer>;
      git_sig: Option<Buffer>;
    },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;

  /**
   * Construct and simulate a get_badges transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get all badges for a specific project, organized by badge type.
   *
   * Returns a structure containing vectors of member addresses for each badge type
   * (Developer, Triage, Community, Verified).
   *
   * # Arguments
   * * `env` - The environment object
   * * `key` - The project key identifier
   *
   * # Returns
   * * `types::Badges` - Structure containing member addresses for each badge type
   */
  get_badges: (
    { key }: { key: Buffer },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Badges>>;

  /**
   * Construct and simulate a get_member transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get member information including all project badges.
   *
   * # Arguments
   * * `env` - The environment object
   * * `member_address` - The address of the member to retrieve
   *
   * # Returns
   * * `types::Member` - Member information including metadata and project badges
   *
   * # Panics
   * * If the member doesn't exist
   */
  get_member: (
    { member_address }: { member_address: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Member>>;

  /**
   * Construct and simulate a set_badges transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Set badges for a member in a specific project.
   *
   * This function replaces all existing badges for the member in the specified project
   * with the new badge list. Repeated badges count once, and an empty list
   * removes the project from the member's record. The member's maximum
   * voting weight is calculated as the sum of all assigned badge weights.
   *
   * # Arguments
   * * `env` - The environment object
   * * `maintainer` - The address of the maintainer (must be authorized)
   * * `key` - The project key identifier
   * * `member` - The address of the member to set badges for
   * * `badges` - Vector of badges to assign
   *
   * # Panics
   * * If the maintainer is not authorized
   * * If the member doesn't exist
   * * If the project doesn't exist
   * * If `badges` holds `Default`
   */
  set_badges: (
    {
      maintainer,
      key,
      member,
      badges,
    }: {
      maintainer: string;
      key: Buffer;
      member: string;
      badges: Array<Badge>;
    },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;

  /**
   * Construct and simulate a update_member transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Update the metadata and optionally the Git identity of an existing member.
   *
   * When `git_identity` is `Some`, the signature is verified the same way
   * as in `add_member` to prevent identity impersonation.
   *
   * # Arguments
   * * `env` - The environment object
   * * `member_address` - The address of the member to update
   * * `meta` - New metadata string
   * * `git_identity` - Git handle (e.g., "github:alice")
   * * `git_pubkey` - Ed25519 public key
   * * `git_sig` - Ed25519 signature
   *
   * # Panics
   * * If the member doesn't exist
   * * If git params are incomplete (identity, key, sig must be all Some or None)
   * * If the signature verification fails
   */
  update_member: (
    {
      member_address,
      meta,
      git_identity,
      git_pubkey,
      git_sig,
    }: {
      member_address: string;
      meta: string;
      git_identity: Option<string>;
      git_pubkey: Option<Buffer>;
      git_sig: Option<Buffer>;
    },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;

  /**
   * Construct and simulate a get_max_weight transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get the maximum voting weight for an address in a specific project.
   *
   * Calculates the sum of all badge weights for the address in the project.
   * Returns the Default badge weight (1) if the address has no badges
   * assigned or is not a registered member.
   *
   * A project with an NQG contract set (see `set_nqg_contract`) uses the
   * weight that contract gives instead of badges.
   *
   * # Arguments
   * * `env` - The environment object
   * * `project_key` - The project key identifier
   * * `member_address` - The address to check
   *
   * # Returns
   * * `u32` - The maximum voting weight for the address
   */
  get_max_weight: (
    {
      project_key,
      member_address,
    }: { project_key: Buffer; member_address: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<u32>>;

  /**
   * Construct and simulate a get_nqg_contract transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get the NQG contract of a project, if any.
   */
  get_nqg_contract: (
    { project_key }: { project_key: Buffer },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Option<ContractRef>>>;

  /**
   * Construct and simulate a set_nqg_contract transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Set, or clear, the NQG contract giving the voting weights of a project.
   *
   * When set, `get_max_weight` returns the contract's
   * `get_voting_power(user: Address) -> u32` for the project, and badges
   * are not used. A weight of 0 means the address cannot vote. A call that
   * fails reads as 0.
   *
   * # Arguments
   * * `env` - The environment object
   * * `maintainer` - A maintainer of the project
   * * `project_key` - The project key identifier
   * * `nqg_contract` - The NQG contract, or `None` to use badges again
   *
   * # Panics
   * * If the maintainer is not authorized
   * * If the contract's WASM hash does not match the given one
   */
  set_nqg_contract: (
    {
      maintainer,
      project_key,
      nqg_contract,
    }: {
      maintainer: string;
      project_key: Buffer;
      nqg_contract: Option<ContractRef>;
    },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;

  /**
   * Construct and simulate a attest transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Record an endorsement (attestation) of a commit or evidence artifact.
   *
   * A multi-party primitive: independent maintainers vouch that they verified the
   * target. Each maintainer may attest a given target at most once — a second
   * call from the same attester is rejected rather than replacing the first, so
   * an attestation is never silently rewritten. Revoking one is an explicit,
   * separately evented action: see `revoke_attestation`. At most
   * `MAX_ATTESTATIONS` are kept on-chain; at capacity, vouches from addresses
   * that are no longer maintainers are pruned, and the call is rejected if
   * that does not free a slot. Current maintainers' vouches are never evicted.
   *
   * # Arguments
   * * `env` - The environment object
   * * `attester` - The maintainer recording the attestation
   * * `project_key` - The project key identifier
   * * `commit_hash` - The commit hash being endorsed
   * * `target` - The attestation target: the commit or a specific evidence artifact
   * * `note` - Optional pointer (e.g. a reproducibility report CID)
   *
   * # Panics
   * * If the contract i
   */
  attest: (
    {
      attester,
      project_key,
      commit_hash,
      target,
      note,
    }: {
      attester: string;
      project_key: Buffer;
      commit_hash: string;
      target: AttestationTarget;
      note: Option<string>;
    },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;

  /**
   * Construct and simulate a commit transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Set the latest commit hash for a project.
   *
   * Updates the current commit hash for the specified project.
   *
   * # Arguments
   * * `env` - The environment object
   * * `maintainer` - The address of the maintainer calling this function
   * * `project_key` - The project key identifier
   * * `hash` - The new commit hash
   *
   * # Panics
   * * If the project doesn't exist
   * * If the maintainer is not authorized
   * * If the hash is not a valid SHA-1 (40 hex) or SHA-256 (64 hex) object name
   */
  commit: (
    {
      maintainer,
      project_key,
      hash,
    }: { maintainer: string; project_key: Buffer; hash: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;

  /**
   * Construct and simulate a register transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Register a new project.
   *
   * Creates a new project entry with maintainers, URL, and metadata.
   * The project key is generated using keccak256 hash of the project name.
   *
   * # Arguments
   * * `env` - The environment object
   * * `maintainer` - The address of the maintainer calling this function
   * * `name` - The project name, 4 to 30 letters and digits
   * * `maintainers` - List of maintainer addresses for the project
   * * `url` - The project's Git repository URL
   * * `ipfs` - CID of the tansu.toml file with associated metadata
   * * `min_voting_period` - Optional minimum voting period override, in seconds
   * * `execute_delay` - Optional DAO execute timelock override, in seconds
   * * `attestation_threshold` - Optional finality threshold percent; when
   * `None` the project is set to `DEFAULT_FINALITY_THRESHOLD_PERCENT`. Can
   * be changed later with `set_attestation_threshold`.
   *
   * # Returns
   * * `Bytes` - The project key (keccak256 hash of the name)
   *
   * # Panics
   * * If the project name is not 4 to 30 letters and digits
   * * If `url` or `ipfs` is longer than 256 bytes
   * * If
   */
  register: (
    {
      maintainer,
      name,
      maintainers,
      url,
      ipfs,
      min_voting_period,
      execute_delay,
      attestation_threshold,
    }: {
      maintainer: string;
      name: string;
      maintainers: Array<string>;
      url: string;
      ipfs: string;
      min_voting_period: Option<u64>;
      execute_delay: Option<u64>;
      attestation_threshold: Option<u32>;
    },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Buffer>>;

  /**
   * Construct and simulate a get_commit transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get the latest commit hash for a project.
   *
   * # Arguments
   * * `env` - The environment object
   * * `project_key` - The project key identifier
   *
   * # Returns
   * * `String` - The current commit hash
   *
   * # Panics
   * * If the project doesn't exist
   */
  get_commit: (
    { project_key }: { project_key: Buffer },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<string>>;

  /**
   * Construct and simulate a get_project transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get project information including configuration and maintainers.
   *
   * # Arguments
   * * `env` - The environment object
   * * `project_key` - The project key identifier
   *
   * # Returns
   * * `types::Project` - Project information including name, config, and maintainers
   *
   * # Panics
   * * If the project doesn't exist
   */
  get_project: (
    { project_key }: { project_key: Buffer },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Project>>;

  /**
   * Construct and simulate a get_evidence transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get the stored evidence history for a specific project commit and kind.
   *
   * Entries are returned oldest-first (the last element is the latest), and at
   * most `MAX_EVIDENCE` are kept on-chain. Returns an empty vector when no
   * evidence has been recorded; consumers reconstruct the full history from
   * `EvidenceSet` events via an indexer.
   *
   * # Arguments
   * * `env` - The environment object
   * * `project_key` - The project key identifier
   * * `commit_hash` - The commit hash this evidence describes
   * * `kind` - The evidence category
   *
   * # Returns
   * * `Vec<types::Evidence>` - The stored evidence pointers, oldest-first
   */
  get_evidence: (
    {
      project_key,
      commit_hash,
      kind,
    }: { project_key: Buffer; commit_hash: string; kind: EvidenceKind },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Array<Evidence>>>;

  /**
   * Construct and simulate a get_projects transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get a page of projects.
   *
   * # Arguments
   * * `env` - The environment object
   * * `page` - The page number (0-based)
   *
   * # Returns
   * * `Vec<types::Project>` - List of projects on the requested page
   */
  get_projects: (
    { page }: { page: u32 },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Array<Project>>>;

  /**
   * Construct and simulate a set_evidence transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Store generic external evidence for a specific project commit and evidence kind.
   *
   * Stores only the verifiable IPFS pointer. Evidence contents remain off-chain.
   *
   * Evidence is append-only: each call adds a new entry to the history for
   * `(project_key, commit_hash, kind)` rather than overwriting the previous
   * one (e.g. successive CVE re-scans of the same commit). At most
   * `MAX_EVIDENCE` entries are kept on-chain; older ones roll off but remain
   * recoverable from `EvidenceSet` events via an indexer.
   *
   * # Arguments
   * * `env` - The environment object
   * * `maintainer` - The address of the maintainer calling this function
   * * `project_key` - The project key identifier
   * * `commit_hash` - The commit hash this evidence describes
   * * `kind` - The evidence category
   * * `cid` - The off-chain content identifier
   *
   * # Panics
   * * If the contract is paused
   * * If the project doesn't exist
   * * If the maintainer is not authorized
   * * If commit_hash is not a valid SHA-1 (40 hex) or SHA-256 (64 hex) object name
   * * If cid is empty
   */
  set_evidence: (
    {
      maintainer,
      project_key,
      commit_hash,
      kind,
      cid,
    }: {
      maintainer: string;
      project_key: Buffer;
      commit_hash: string;
      kind: EvidenceKind;
      cid: string;
    },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;

  /**
   * Construct and simulate a update_config transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Update the configuration of an existing project.
   *
   * Changes the project's URL, IPFS metadata, and maintainer list, and
   * optionally its governance overrides. `None` governance params leave
   * the current values untouched; to restore a default, pass it explicitly.
   *
   * Tightening (new >= current) applies immediately; loosening activates
   * after a notice window of current `min_voting_period + execute_delay`.
   * In-flight proposals keep their creation-time timelock.
   *
   * # Arguments
   * * `env` - The environment object
   * * `maintainer` - The address of the maintainer calling this function
   * * `key` - The project key identifier
   * * `maintainers` - New list of maintainer addresses
   * * `url` - New Git repository URL
   * * `ipfs` - New CID of the tansu.toml file with metadata
   * * `min_voting_period` - Optional new minimum voting period, in seconds
   * * `execute_delay` - Optional new DAO execute timelock, in seconds
   * * `attestation_threshold` - Optional new finality threshold percent;
   * when `None` the project's current threshold is left unchanged
   *
   * # Panics
   * *
   */
  update_config: (
    {
      maintainer,
      key,
      maintainers,
      url,
      ipfs,
      min_voting_period,
      execute_delay,
      attestation_threshold,
    }: {
      maintainer: string;
      key: Buffer;
      maintainers: Array<string>;
      url: string;
      ipfs: string;
      min_voting_period: Option<u64>;
      execute_delay: Option<u64>;
      attestation_threshold: Option<u32>;
    },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;

  /**
   * Construct and simulate a get_attestations transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get the attestations recorded for a project's commit or evidence target.
   *
   * Entries are returned oldest-first (the last element is the most recent) and
   * hold at most one entry per attester, capped at `MAX_ATTESTATIONS`. The full
   * history stays recoverable from `Attested` events via an indexer.
   * Returns an empty vector when nothing has been attested for the target.
   *
   * # Arguments
   * * `env` - The environment object
   * * `project_key` - The project key identifier
   * * `commit_hash` - The commit hash the attestations relate to
   * * `target` - The attestation target: the commit or a specific evidence artifact
   *
   * # Returns
   * * `Vec<types::Attestation>` - The stored attestations, oldest-first
   */
  get_attestations: (
    {
      project_key,
      commit_hash,
      target,
    }: { project_key: Buffer; commit_hash: string; target: AttestationTarget },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Array<Attestation>>>;

  /**
   * Construct and simulate a get_sub_projects transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get sub-projects for a project (if it's an organization).
   *
   * # Arguments
   * * `env` - The environment object
   * * `project_key` - The project key identifier
   *
   * # Returns
   * * `Vec<Bytes>` - List of sub-project keys, empty if not an organization
   */
  get_sub_projects: (
    { project_key }: { project_key: Buffer },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Array<Buffer>>>;

  /**
   * Construct and simulate a set_sub_projects transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Set sub-projects for a project (making it an organization).
   *
   * Note: by design, sub-project keys are not validated against existing
   * projects. This allows reserving a project space before the project is
   * registered (since the key is derived from the name). A project can
   * also appear in multiple organizations.
   *
   * # Arguments
   * * `env` - The environment object
   * * `maintainer` - The maintainer address calling this function
   * * `project_key` - The project key identifier
   * * `sub_projects` - List of sub-project keys to associate
   *
   * # Panics
   * * If the project doesn't exist
   * * If the maintainer is not authorized
   * * If more than 10 sub-projects are provided
   */
  set_sub_projects: (
    {
      maintainer,
      project_key,
      sub_projects,
    }: { maintainer: string; project_key: Buffer; sub_projects: Array<Buffer> },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;

  /**
   * Construct and simulate a revoke_attestation transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Revoke the caller's own attestation from a target.
   *
   * Only the attester can remove their vouch, and only their own: a maintainer
   * cannot strike another's. Revocation is bounded twice over, so a vouch that
   * others have already relied on cannot be pulled out from under them:
   *
   * 1. **Not once the target is final.** An `attest` that brings the target
   * to its threshold records finality, which is never cleared. A target
   * can also read as final without that record after maintainers are
   * removed; it then becomes revocable again if they are added back.
   * 2. **Not after `ATTESTATION_REVOCATION_WINDOW`** has elapsed since
   * `created_at`. Past that the vouch is permanent.
   *
   * Within those bounds, revoking frees the slot and the caller may attest the
   * target again with a fresh `created_at` — revoke plus re-attest is the
   * supported way to amend a `note` or correct a mistaken vouch. The
   * `Attested` / `AttestationRevoked` event pair is the durable audit trail.
   *
   * # Arguments
   * * `env` - The environment object
   * * `attester` - The maintainer revoki
   */
  revoke_attestation: (
    {
      attester,
      project_key,
      commit_hash,
      target,
    }: {
      attester: string;
      project_key: Buffer;
      commit_hash: string;
      target: AttestationTarget;
    },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;

  /**
   * Construct and simulate a get_attestation_finality transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Compute whether an attestation target is final (canonical), on-chain.
   *
   * A target is final once the share of the project's *current* maintainers
   * that have attested it reaches the project's finality threshold. The target
   * is either the commit itself (`Commit`) or a specific evidence artifact
   * (`Evidence(kind, cid)`) tied to that commit. Attestations from addresses
   * that are no longer maintainers are ignored, so a removed maintainer's stale
   * vouch cannot inflate the count.
   *
   * # Arguments
   * * `env` - The environment object
   * * `project_key` - The project key identifier
   * * `commit_hash` - The commit hash being evaluated
   * * `target` - The attestation target: the commit or a specific evidence artifact
   *
   * # Returns
   * * `types::FinalityStatus` - `{ attested, total, is_final }`
   *
   * # Panics
   * * If the project doesn't exist
   */
  get_attestation_finality: (
    {
      project_key,
      commit_hash,
      target,
    }: { project_key: Buffer; commit_hash: string; target: AttestationTarget },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<FinalityStatus>>;

  /**
   * Construct and simulate a get_attestation_threshold transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get the attestation finality threshold (percent) for a project.
   *
   * Returns the project's stored threshold, or `DEFAULT_FINALITY_THRESHOLD_PERCENT`
   * when the project has not set one.
   *
   * # Arguments
   * * `env` - The environment object
   * * `project_key` - The project key identifier
   *
   * # Returns
   * * `u32` - The finality threshold percent for the project
   */
  get_attestation_threshold: (
    { project_key }: { project_key: Buffer },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<u32>>;

  /**
   * Construct and simulate a set_attestation_threshold transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Set the attestation finality threshold (percent) for a project.
   *
   * A commit is considered final once the share of current maintainers that
   * have attested it reaches this percentage. Every project defaults to
   * `DEFAULT_FINALITY_THRESHOLD_PERCENT` until its maintainers set a value here.
   * A higher threshold applies at once; a lower one after the notice window
   * of the project's `min_voting_period + execute_delay`.
   *
   * # Arguments
   * * `env` - The environment object
   * * `maintainer` - The address of the maintainer calling this function
   * * `project_key` - The project key identifier
   * * `percent` - The threshold percent (in `MIN_FINALITY_THRESHOLD_PERCENT..=100`)
   *
   * # Panics
   * * If the contract is paused
   * * If the project doesn't exist or the maintainer is not authorized
   * * If `percent` is below `MIN_FINALITY_THRESHOLD_PERCENT` or above 100
   */
  set_attestation_threshold: (
    {
      maintainer,
      project_key,
      attestation_threshold,
    }: {
      maintainer: string;
      project_key: Buffer;
      attestation_threshold: Option<u32>;
    },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;
}
export class Client extends ContractClient {
  static async deploy<T = Client>(
    /** Constructor/Initialization Args for the contract's `__constructor` method */
    {
      admin,
      collateral,
      executor,
    }: { admin: string; collateral: string; executor: string },
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      },
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({ admin, collateral, executor }, options);
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([
        "AAAAAAAAA81DYXN0IGEgdm90ZSBvbiBhIHByb3Bvc2FsLgoKQWxsb3dzIGEgbWVtYmVyIHRvIHZvdGUgb24gYSBwcm9wb3NhbC4KVGhlIHZvdGUgY2FuIGJlIGVpdGhlciBwdWJsaWMgb3IgYW5vbnltb3VzIGRlcGVuZGluZyBvbiB0aGUgcHJvcG9zYWwgY29uZmlndXJhdGlvbi4KRm9yIHB1YmxpYyB2b3RlcywgdGhlIGNob2ljZSBhbmQgd2VpZ2h0IGFyZSB2aXNpYmxlLiBGb3IgYW5vbnltb3VzIHZvdGVzLCBvbmx5CnRoZSB3ZWlnaHQgaXMgdmlzaWJsZSwgYW5kIHRoZSBjaG9pY2UgaXMgZW5jcnlwdGVkLgoKQmFkZ2UtYmFzZWQgcHJvcG9zYWxzIGNhcCB3ZWlnaHQgYnkgbWVtYmVyc2hpcCBiYWRnZXMuIFRva2VuLWJhc2VkCnByb3Bvc2FscyByZXF1aXJlIGB3ZWlnaHRgICh3aG9sZSB0b2tlbnMpIG5vdCB0byBleGNlZWQgdGhlIHZvdGVyJ3MKY3VycmVudCB0b2tlbiBiYWxhbmNlLiBWb3RlcyBvZiB3ZWlnaHQgMSB0YWtlIGF0IG1vc3QKYE1BWF9ERUZBVUxUX1dFSUdIVF9WT1RFU2Agb2YgdGhlIGBNQVhfVk9URVNfUEVSX1BST1BPU0FMYCBzbG90cy4KCiMgQXJndW1lbnRzCiogYGVudmAgLSBUaGUgZW52aXJvbm1lbnQgb2JqZWN0CiogYHZvdGVyYCAtIFRoZSBhZGRyZXNzIG9mIHRoZSB2b3RlcgoqIGBwcm9qZWN0X2tleWAgLSBUaGUgcHJvamVjdCBrZXkgaWRlbnRpZmllcgoqIGBwcm9wb3NhbF9pZGAgLSBUaGUgSUQgb2YgdGhlIHByb3Bvc2FsIHRvIHZvdGUgb24KKiBgdm90ZWAgLSBUaGUgdm90ZSBkYXRhIChwdWJsaWMgb3IgYW5vbnltb3VzKQoKIyBQYW5pY3MKKiBJZiB0aGUgdm90ZXIgaGFzIGFscmVhZHkgdm90ZWQKKiBJZiB0aGUgdm90aW5nIHBlcmlvZCBoYXMgZW5kZWQKKiBJZiB0aGUgcHJvcG9zYWwgaXMgbm90IGFjdGl2ZSBhbnltb3JlCiogSWYgdGhlIHByb3Bvc2FsIGRvZXNuJ3QgZXhpc3QKKiBJZiB0aGUgdm90ZXIncyB3ZWlnaHQgZXhjZWVkcyB0aGVpciBtYXhpbXVtIGFsbG93ZWQgd2VpZ2h0AAAAAAAABHZvdGUAAAAEAAAAAAAAAAV2b3RlcgAAAAAAABMAAAAAAAAAC3Byb2plY3Rfa2V5AAAAAA4AAAAAAAAAC3Byb3Bvc2FsX2lkAAAAAAQAAAAAAAAABHZvdGUAAAfQAAAABFZvdGUAAAAA",
        "AAAAAAAABABWZXJpZnkgdm90ZSBjb21taXRtZW50IHByb29mIGZvciBhbm9ueW1vdXMgdm90aW5nLgoKVmFsaWRhdGVzIHRoYXQgdGhlIHByb3ZpZGVkIHRhbGxpZXMgYW5kIHNlZWRzIG1hdGNoIHRoZSB2b3RlIGNvbW1pdG1lbnRzCndpdGhvdXQgcmV2ZWFsaW5nIGluZGl2aWR1YWwgdm90ZXMuIFRoaXMgZW5zdXJlcyB0aGUgaW50ZWdyaXR5IG9mIGFub255bW91cwp2b3RpbmcgcmVzdWx0cy4KClRoZSBjb21taXRtZW50IGlzOgoKQyA9IGdediAqIGheciAoaW4gYWRkaXRpdmUgbm90YXRpb246IGcqdiArIGgqciksCgp3aGVyZSBnLCBoIGFyZSBCTFMxMi0zODEgZ2VuZXJhdG9yIHBvaW50cyBhbmQgdiBpcyB0aGUgdm90ZSBjaG9pY2UsCnIgaXMgdGhlIHNlZWQuIFZvdGluZyB3ZWlnaHQgaXMgaW50cm9kdWNlZCBkdXJpbmcgdGhlIHRhbGx5aW5nIHBoYXNlLgoKIyBBcmd1bWVudHMKKiBgZW52YCAtIFRoZSBlbnZpcm9ubWVudCBvYmplY3QKKiBgcHJvamVjdF9rZXlgIC0gVGhlIHByb2plY3Qga2V5IGlkZW50aWZpZXIKKiBgcHJvcG9zYWxgIC0gVGhlIHByb3Bvc2FsIGNvbnRhaW5pbmcgdm90ZSBjb21taXRtZW50cwoqIGB0YWxsaWVzYCAtIERlY29kZWQgdGFsbHkgdmFsdWVzIFthcHByb3ZlLCByZWplY3QsIGFic3RhaW5dIChzY2FsZWQgYnkgd2VpZ2h0cykKKiBgc2VlZHNgIC0gRGVjb2RlZCBzZWVkIHZhbHVlcyBbYXBwcm92ZSwgcmVqZWN0LCBhYnN0YWluXSAoc2NhbGVkIGJ5IHdlaWdodHMpCgojIFJldHVybnMKKiBgYm9vbGAgLSBUcnVlIGlmIGFsbCBjb21taXRtZW50cyBtYXRjaCB0aGUgcHJvdmlkZWQgdGFsbGllcyBhbmQgc2VlZHMKCk9ubHkgYHByb3Bvc2FsLmlkYCBpcyB1c2VkOyB0aGUgcHJvcG9zYWwgaXMgcmVhZCBmcm9tIHN0b3JhZ2UuCgojIFBhbmljcwoqIElmIG5vIGFub255bW91cyB2b3RpbmcgY29uZmlndXJhdGlvbiBleGlzdHMgZm9yIHRoZSBwcm9qZWN0CiogSWYgdGhlIHByb3Bvc2FsIGRvZXNuJ3QgZXhpc3QKKiBJZiBgdGFsbGllc2Agb3IgYHNlZWRzYCBkb2VzIG5vdCBob2xkAAAABXByb29mAAAAAAAABAAAAAAAAAALcHJvamVjdF9rZXkAAAAADgAAAAAAAAAIcHJvcG9zYWwAAAfQAAAACFByb3Bvc2FsAAAAAAAAAAd0YWxsaWVzAAAAA+oAAAAKAAAAAAAAAAVzZWVkcwAAAAAAA+oAAAAKAAAAAQAAAAE=",
        "AAAAAAAABABFeGVjdXRlIGEgdm90ZSBhZnRlciB0aGUgdm90aW5nIHBlcmlvZCBlbmRzLgoKUHJvY2Vzc2VzIHRoZSB2b3RpbmcgcmVzdWx0cyBhbmQgZGV0ZXJtaW5lcyB0aGUgZmluYWwgc3RhdHVzIG9mIHRoZSBwcm9wb3NhbC4KRm9yIHB1YmxpYyB2b3RlcywgdGhlIHJlc3VsdHMgYXJlIGNhbGN1bGF0ZWQgZGlyZWN0bHkgZnJvbSB2b3RlIGNvdW50cy4KRm9yIGFub255bW91cyB2b3RlcywgdGFsbGllcyBhbmQgc2VlZHMgYXJlIHZhbGlkYXRlZCBhZ2FpbnN0IHZvdGUgY29tbWl0bWVudHMKdG8gZW5zdXJlIHRoZSByZXN1bHRzIGFyZSBjb3JyZWN0LgoKIyBBcmd1bWVudHMKKiBgZW52YCAtIFRoZSBlbnZpcm9ubWVudCBvYmplY3QKKiBgbWFpbnRhaW5lcmAgLSBUaGUgYWRkcmVzcyBvZiB0aGUgbWFpbnRhaW5lciBleGVjdXRpbmcgdGhlIHByb3Bvc2FsCiogYHByb2plY3Rfa2V5YCAtIFRoZSBwcm9qZWN0IGtleSBpZGVudGlmaWVyCiogYHByb3Bvc2FsX2lkYCAtIFRoZSBJRCBvZiB0aGUgcHJvcG9zYWwgdG8gZXhlY3V0ZQoqIFtgT3B0aW9uPHRhbGxpZXM+YF0gLSBkZWNvZGVkIHRhbGx5IHZhbHVlcyAoc2NhbGVkIGJ5IHdlaWdodHMpLCByZXNwZWN0aXZlbHkgQXBwcm92ZSwgcmVqZWN0IGFuZCBhYnN0YWluCiogW2BPcHRpb248c2VlZHM+YF0gLSBkZWNvZGVkIHNlZWQgdmFsdWVzIChzY2FsZWQgYnkgd2VpZ2h0cyksIHJlc3BlY3RpdmVseSBBcHByb3ZlLCByZWplY3QgYW5kIGFic3RhaW4KCiMgUmV0dXJucwoqIGB0eXBlczo6UHJvcG9zYWxTdGF0dXNgIC0gVGhlIGZpbmFsIHN0YXR1cyBvZiB0aGUgcHJvcG9zYWwgKEFwcHJvdmVkLCBSZWplY3RlZCwgb3IgQ2FuY2VsbGVkKQoKIyBQYW5pY3MKKiBJZiB0aGUgdm90aW5nIHBlcmlvZCBoYXNuJ3QgZW5kZWQKKiBJZiB0aGUgcHJvcG9zYWwgZG9lc24ndCBleGlzdAoqIElmIHRoZSBwcm9wb3NhbCBpcyBub3QgYWN0aXZlIGFueW1vcmUKKiBJZiB0YWxsaWVzL3NlZWRzIGFyZSBtaXNzaW5nIGZvciBhbm9ueW1vdXMgdm90ZXMKKiBJZiBjb21taXRtZW50AAAAB2V4ZWN1dGUAAAAABQAAAAAAAAAKbWFpbnRhaW5lcgAAAAAAEwAAAAAAAAALcHJvamVjdF9rZXkAAAAADgAAAAAAAAALcHJvcG9zYWxfaWQAAAAABAAAAAAAAAAHdGFsbGllcwAAAAPoAAAD6gAAAAoAAAAAAAAABXNlZWRzAAAAAAAD6AAAA+oAAAAKAAAAAQAAB9AAAAAOUHJvcG9zYWxTdGF0dXMAAA==",
        "AAAAAAAAAcZSZXR1cm5zIGEgcGFnZSBvZiBwcm9wb3NhbHMgKDAgdG8gTUFYX1BST1BPU0FMU19QRVJfUEFHRSBwcm9wb3NhbHMgcGVyIHBhZ2UpLgoKUHJvcG9zYWwgYGlkYCBpcyBvbiBwYWdlIGBpZCAvIE1BWF9QUk9QT1NBTFNfUEVSX1BBR0VgLiBSZXZva2VkCnByb3Bvc2FscyBhcmUgZGVsZXRlZCBhbmQgbGVmdCBvdXQsIHNvIGEgcGFnZSBjYW4gaG9sZCBmZXdlci4KCiMgQXJndW1lbnRzCiogYGVudmAgLSBUaGUgZW52aXJvbm1lbnQgb2JqZWN0CiogYHByb2plY3Rfa2V5YCAtIFRoZSBwcm9qZWN0IGtleSBpZGVudGlmaWVyCiogYHBhZ2VgIC0gVGhlIHBhZ2UgbnVtYmVyICgwLWJhc2VkKQoKIyBSZXR1cm5zCiogYHR5cGVzOjpEYW9gIC0gVGhlIERBTyBvYmplY3QgY29udGFpbmluZyBhIHBhZ2Ugb2YgcHJvcG9zYWxzCgojIFBhbmljcwoqIElmIHRoZSBwYWdlIG51bWJlciBpcyBvdXQgb2YgYm91bmRzAAAAAAAHZ2V0X2RhbwAAAAACAAAAAAAAAAtwcm9qZWN0X2tleQAAAAAOAAAAAAAAAARwYWdlAAAABAAAAAEAAAfQAAAAA0RhbwA=",
        "AAAAAAAAAnNSZW1vdmUgYSBtYWxpY2lvdXMgb3Igbm9uLWNvbXBsaWFudCB2b3RlIGZyb20gYSBwcm9wb3NhbC4KCk9ubHkgYSBwcm9qZWN0IG1haW50YWluZXIgY2FuIGNhbGwgdGhpcy4gVGhlIHZvdGUgYW5kIGl0cyB0YWxseQpjb250cmlidXRpb24gYXJlIGRyb3BwZWQuIFRoZSB2b3RlIG11c3QgYmUgY2FzdCBvbiBhbiBhY3RpdmUgcHJvcG9zYWwKKHJlbW92YWwgaXMgYWxsb3dlZCBldmVuIGFmdGVyIHRoZSB2b3RpbmcgcGVyaW9kIGVuZHMpLgoKIyBBcmd1bWVudHMKKiBgZW52YCAtIFRoZSBlbnZpcm9ubWVudCBvYmplY3QKKiBgbWFpbnRhaW5lcmAgLSBBZGRyZXNzIG9mIHRoZSBtYWludGFpbmVyIHJlbW92aW5nIHRoZSB2b3RlCiogYHByb2plY3Rfa2V5YCAtIFRoZSBwcm9qZWN0IGtleSBpZGVudGlmaWVyCiogYHByb3Bvc2FsX2lkYCAtIFRoZSBJRCBvZiB0aGUgcHJvcG9zYWwKKiBgdm90ZXJgIC0gVGhlIGFkZHJlc3Mgb2YgdGhlIHZvdGVyIHdob3NlIHZvdGUgaXMgYmVpbmcgcmVtb3ZlZAoKIyBQYW5pY3MKKiBJZiB0aGUgbWFpbnRhaW5lciBpcyBub3QgYXV0aG9yaXplZAoqIElmIHRoZSBwcm9wb3NhbCBpcyBub3QgYWN0aXZlCiogSWYgbm8gdm90ZSBmcm9tIHRoZSBnaXZlbiB2b3RlciBleGlzdHMAAAAAC3JlbW92ZV92b3RlAAAAAAQAAAAAAAAACm1haW50YWluZXIAAAAAABMAAAAAAAAAC3Byb2plY3Rfa2V5AAAAAA4AAAAAAAAAC3Byb3Bvc2FsX2lkAAAAAAQAAAAAAAAABXZvdGVyAAAAAAAAEwAAAAA=",
        "AAAAAAAAAQtHZXQgYSBzaW5nbGUgcHJvcG9zYWwgYnkgSUQuCgojIEFyZ3VtZW50cwoqIGBlbnZgIC0gVGhlIGVudmlyb25tZW50IG9iamVjdAoqIGBwcm9qZWN0X2tleWAgLSBUaGUgcHJvamVjdCBrZXkgaWRlbnRpZmllcgoqIGBwcm9wb3NhbF9pZGAgLSBUaGUgSUQgb2YgdGhlIHByb3Bvc2FsIHRvIHJldHJpZXZlCgojIFJldHVybnMKKiBgdHlwZXM6OlByb3Bvc2FsYCAtIFRoZSBwcm9wb3NhbCBvYmplY3QKCiMgUGFuaWNzCiogSWYgdGhlIHByb3Bvc2FsIGRvZXNuJ3QgZXhpc3QAAAAADGdldF9wcm9wb3NhbAAAAAIAAAAAAAAAC3Byb2plY3Rfa2V5AAAAAA4AAAAAAAAAC3Byb3Bvc2FsX2lkAAAAAAQAAAABAAAH0AAAAAhQcm9wb3NhbA==",
        "AAAAAAAABABDcmVhdGUgYSBuZXcgcHJvcG9zYWwgZm9yIGEgcHJvamVjdC4KClRoZSBwcm9wb3NlciBpcyBhdXRvbWF0aWNhbGx5IGFkZGVkIHRvIHRoZSBhYnN0YWluIGdyb3VwLgpCeSBjcmVhdGluZyBhIHByb3Bvc2FsLCB0aGUgcHJvcG9zZXIgaW5jdXIgYSBjb2xsYXRlcmFsIHdoaWNoIGlzCnJlcGFpZCB1cG9uIGV4ZWN1dGlvbiBvZiB0aGUgcHJvcG9zYWwgdW5sZXNzIHRoZSBwcm9wb3NhbCBpcyByZXZva2VkLgpUaGlzIGlzIGEgZGV0ZXJyZW50IG1lY2hhbmlzbS4KCiMgQXJndW1lbnRzCiogYGVudmAgLSBUaGUgZW52aXJvbm1lbnQgb2JqZWN0CiogYHByb3Bvc2VyYCAtIEFkZHJlc3Mgb2YgdGhlIHByb3Bvc2FsIGNyZWF0b3IKKiBgcHJvamVjdF9rZXlgIC0gVW5pcXVlIGlkZW50aWZpZXIgZm9yIHRoZSBwcm9qZWN0CiogYHRpdGxlYCAtIFRpdGxlIG9mIHRoZSBwcm9wb3NhbAoqIGBpcGZzYCAtIElQRlMgY29udGVudCBpZGVudGlmaWVyIGRlc2NyaWJpbmcgdGhlIHByb3Bvc2FsCiogYHZvdGluZ19lbmRzX2F0YCAtIFVOSVggdGltZXN0YW1wIHdoZW4gdm90aW5nIGVuZHMKKiBgcHVibGljX3ZvdGluZ2AgLSBXaGV0aGVyIHZvdGluZyBpcyBwdWJsaWMgb3IgYW5vbnltb3VzCiogW2BPcHRpb248dG9rZW5fY29udHJhY3Q+YF0gLSB0b2tlbiBjb250cmFjdCBmb3IgdG9rZW4tYmFzZWQgdm90aW5nOwpvbmx5IGEgbWFpbnRhaW5lciBzZXRzIG9uZSwgYW5kIG5ldmVyIG9uIGEgcHJvamVjdCB3ZWlnaHRlZCBieSBOUUcKKiBbYE9wdGlvbjxWZWM8T3V0Y29tZUNvbnRyYWN0Pj5gXSAtIGF0IG1vc3QgdGhyZWUgb3V0Y29tZSBjb250cmFjdHMsCmZvciBBcHByb3ZlZCwgUmVqZWN0ZWQgYW5kIENhbmNlbGxlZCwgcnVuIGJ5IHRoZSBleGVjdXRvcgoKIyBSZXR1cm5zCiogYHUzMmAgLSBUaGUgSUQgb2YgdGhlIGNyZWF0ZWQgcHJvcG9zYWwuCgojIFBhbmljcwoqIElmIHRoZSB0aXRsZSBpcyB0b28gbG9uZwoqIElmIHRoZSB2b3RpbmcgcGVyaW9kIGlzIGludmFsaWQKKiBJZiB0aGUgcHJvamVjdCBkb2Vzbid0AAAAD2NyZWF0ZV9wcm9wb3NhbAAAAAAIAAAAAAAAAAhwcm9wb3NlcgAAABMAAAAAAAAAC3Byb2plY3Rfa2V5AAAAAA4AAAAAAAAABXRpdGxlAAAAAAAAEAAAAAAAAAAEaXBmcwAAABAAAAAAAAAADnZvdGluZ19lbmRzX2F0AAAAAAAGAAAAAAAAAA1wdWJsaWNfdm90aW5nAAAAAAAAAQAAAAAAAAAOdG9rZW5fY29udHJhY3QAAAAAA+gAAAATAAAAAAAAABFvdXRjb21lX2NvbnRyYWN0cwAAAAAAA+gAAAPqAAAH0AAAAA9PdXRjb21lQ29udHJhY3QAAAAAAQAAAAQ=",
        "AAAAAAAAAcxSZXZva2UgYSBwcm9wb3NhbC4KClVzZWZ1bCBpZiB0aGVyZSB3YXMgc29tZSBzcGFtIG9yIGJhZCBpbnRlbnQuIERlbGV0ZXMgdGhlIHByb3Bvc2FsIGFuZAppdHMgdm90ZXM7IGl0cyBpZCBzdGF5cyB0YWtlbi4gRm9yZmVpdHMgdGhlIHByb3Bvc2VyJ3MgY29sbGF0ZXJhbC4KCiMgQXJndW1lbnRzCiogYGVudmAgLSBUaGUgZW52aXJvbm1lbnQgb2JqZWN0CiogYG1haW50YWluZXJgIC0gQWRkcmVzcyBvZiB0aGUgbWFpbnRhaW5lciBvciBhZG1pbiByZXZva2luZyB0aGUgcHJvcG9zYWwKKiBgcHJvamVjdF9rZXlgIC0gVGhlIHByb2plY3Qga2V5IGlkZW50aWZpZXIKKiBgcHJvcG9zYWxfaWRgIC0gVGhlIElEIG9mIHRoZSBwcm9wb3NhbCB0byByZXZva2UKCiMgUGFuaWNzCiogSWYgdGhlIHByb3Bvc2FsIGlzIG5vdCBhY3RpdmUgYW55bW9yZQoqIElmIHRoZSBtYWludGFpbmVyIGlzIG5vdCBhdXRob3JpemVkAAAAD3Jldm9rZV9wcm9wb3NhbAAAAAADAAAAAAAAAAptYWludGFpbmVyAAAAAAATAAAAAAAAAAtwcm9qZWN0X2tleQAAAAAOAAAAAAAAAAtwcm9wb3NhbF9pZAAAAAAEAAAAAA==",
        "AAAAAAAAAZ9TZXR1cCBhbm9ueW1vdXMgdm90aW5nIGZvciBhIHByb2plY3QuCgpDb25maWd1cmVzIEJMUzEyLTM4MSBjcnlwdG9ncmFwaGljIHByaW1pdGl2ZXMgZm9yIGFub255bW91cyB2b3RpbmcuCgojIEFyZ3VtZW50cwoqIGBlbnZgIC0gVGhlIGVudmlyb25tZW50IG9iamVjdAoqIGBtYWludGFpbmVyYCAtIFRoZSBhZGRyZXNzIG9mIHRoZSBtYWludGFpbmVyIChtdXN0IGJlIGF1dGhvcml6ZWQpCiogYHByb2plY3Rfa2V5YCAtIFVuaXF1ZSBpZGVudGlmaWVyIGZvciB0aGUgcHJvamVjdAoqIGBwdWJsaWNfa2V5YCAtIEFzeW1tZXRyaWMgcHVibGljIGtleSB0byBiZSB1c2VkIGZvciB2b3RlIGVuY3J5cHRpb24KCiMgUGFuaWNzCiogSWYgdGhlIGNhbGxlciBpcyBub3QgYW4gYXV0aG9yaXplZCBtYWludGFpbmVyIG9mIHRoZSBwcm9qZWN0AAAAABZhbm9ueW1vdXNfdm90aW5nX3NldHVwAAAAAAADAAAAAAAAAAptYWludGFpbmVyAAAAAAATAAAAAAAAAAtwcm9qZWN0X2tleQAAAAAOAAAAAAAAAApwdWJsaWNfa2V5AAAAAAAQAAAAAA==",
        "AAAAAAAAAcJBZGQgYWRkcmVzc2VzIHRvIHRoZSBjb25mbGljdC1vZi1pbnRlcmVzdCBsaXN0IG9mIGEgcHJvcG9zYWwuCgpBZGRyZXNzZXMgb24gdGhlIGxpc3QgY2Fubm90IGNhc3QgYSB2b3RlIG9uIHRoZSBwcm9wb3NhbC4KCiMgQXJndW1lbnRzCiogYGVudmAgLSBUaGUgZW52aXJvbm1lbnQgb2JqZWN0CiogYG1haW50YWluZXJgIC0gQSBtYWludGFpbmVyIG9mIHRoZSBwcm9qZWN0IChtdXN0IGF1dGhlbnRpY2F0ZSkKKiBgcHJvamVjdF9rZXlgIC0gVGhlIHByb2plY3Qga2V5IGlkZW50aWZpZXIKKiBgcHJvcG9zYWxfaWRgIC0gVGhlIElEIG9mIHRoZSBwcm9wb3NhbAoqIGBhZGRyZXNzZXNgIC0gQWRkcmVzc2VzIHRvIGFkZCB0byB0aGUgbGlzdAoKIyBQYW5pY3MKKiBJZiB0aGUgbWFpbnRhaW5lciBpcyBub3QgYXV0aG9yaXplZAoqIElmIHRoZSBwcm9wb3NhbCBpcyBub3QgYWN0aXZlIGFueW1vcmUAAAAAABhhZGRfY29uZmxpY3Rfb2ZfaW50ZXJlc3QAAAAEAAAAAAAAAAptYWludGFpbmVyAAAAAAATAAAAAAAAAAtwcm9qZWN0X2tleQAAAAAOAAAAAAAAAAtwcm9wb3NhbF9pZAAAAAAEAAAAAAAAAAlhZGRyZXNzZXMAAAAAAAPqAAAAEwAAAAA=",
        "AAAAAAAAAQBHZXQgdGhlIGNvbmZsaWN0LW9mLWludGVyZXN0IGxpc3QgZm9yIGEgcHJvcG9zYWwuCgojIEFyZ3VtZW50cwoqIGBlbnZgIC0gVGhlIGVudmlyb25tZW50IG9iamVjdAoqIGBwcm9qZWN0X2tleWAgLSBUaGUgcHJvamVjdCBrZXkgaWRlbnRpZmllcgoqIGBwcm9wb3NhbF9pZGAgLSBUaGUgSUQgb2YgdGhlIHByb3Bvc2FsCgojIFJldHVybnMKKiBgVmVjPEFkZHJlc3M+YCAtIEFkZHJlc3NlcyBiYXJyZWQgZnJvbSB2b3Rpbmcgb24gdGhlIHByb3Bvc2FsAAAAGGdldF9jb25mbGljdF9vZl9pbnRlcmVzdAAAAAIAAAAAAAAAC3Byb2plY3Rfa2V5AAAAAA4AAAAAAAAAC3Byb3Bvc2FsX2lkAAAAAAQAAAABAAAD6gAAABM=",
        "AAAAAAAAASdHZXQgdGhlIGFub255bW91cyB2b3RpbmcgY29uZmlndXJhdGlvbiBmb3IgYSBwcm9qZWN0LgoKIyBBcmd1bWVudHMKKiBgZW52YCAtIFRoZSBlbnZpcm9ubWVudCBvYmplY3QKKiBgcHJvamVjdF9rZXlgIC0gVGhlIHByb2plY3Qga2V5IGlkZW50aWZpZXIKCiMgUmV0dXJucwoqIGB0eXBlczo6QW5vbnltb3VzVm90ZUNvbmZpZ2AgLSBUaGUgYW5vbnltb3VzIHZvdGluZyBjb25maWd1cmF0aW9uCgojIFBhbmljcwoqIElmIG5vIGFub255bW91cyB2b3RpbmcgY29uZmlndXJhdGlvbiBleGlzdHMgZm9yIHRoZSBwcm9qZWN0AAAAABtnZXRfYW5vbnltb3VzX3ZvdGluZ19jb25maWcAAAAAAQAAAAAAAAALcHJvamVjdF9rZXkAAAAADgAAAAEAAAfQAAAAE0Fub255bW91c1ZvdGVDb25maWcA",
        "AAAAAAAAAZFSZW1vdmUgYWRkcmVzc2VzIGZyb20gdGhlIGNvbmZsaWN0LW9mLWludGVyZXN0IGxpc3Qgb2YgYSBwcm9wb3NhbC4KCiMgQXJndW1lbnRzCiogYGVudmAgLSBUaGUgZW52aXJvbm1lbnQgb2JqZWN0CiogYG1haW50YWluZXJgIC0gQSBtYWludGFpbmVyIG9mIHRoZSBwcm9qZWN0IChtdXN0IGF1dGhlbnRpY2F0ZSkKKiBgcHJvamVjdF9rZXlgIC0gVGhlIHByb2plY3Qga2V5IGlkZW50aWZpZXIKKiBgcHJvcG9zYWxfaWRgIC0gVGhlIElEIG9mIHRoZSBwcm9wb3NhbAoqIGBhZGRyZXNzZXNgIC0gQWRkcmVzc2VzIHRvIHJlbW92ZSBmcm9tIHRoZSBsaXN0CgojIFBhbmljcwoqIElmIHRoZSBtYWludGFpbmVyIGlzIG5vdCBhdXRob3JpemVkCiogSWYgdGhlIHByb3Bvc2FsIGlzIG5vdCBhY3RpdmUgYW55bW9yZQAAAAAAABtyZW1vdmVfY29uZmxpY3Rfb2ZfaW50ZXJlc3QAAAAABAAAAAAAAAAKbWFpbnRhaW5lcgAAAAAAEwAAAAAAAAALcHJvamVjdF9rZXkAAAAADgAAAAAAAAALcHJvcG9zYWxfaWQAAAAABAAAAAAAAAAJYWRkcmVzc2VzAAAAAAAD6gAAABMAAAAA",
        "AAAAAAAAAxJCdWlsZCB2b3RlIGNvbW1pdG1lbnRzIGZyb20gdm90ZXMgYW5kIHNlZWRzIGZvciBhbm9ueW1vdXMgdm90aW5nLgoKQ3JlYXRlcyBCTFMxMi0zODEgY29tbWl0bWVudHMgZm9yIGVhY2ggdm90ZSB1c2luZyB0aGUgZm9ybXVsYToKQyA9IGfCt3ZvdGUgKyBowrdzZWVkIHdoZXJlIGcgYW5kIGggYXJlIGdlbmVyYXRvciBwb2ludHMgb24gQkxTMTItMzgxLgoKTm90ZTogVGhpcyBmdW5jdGlvbiBkb2VzIG5vdCBjb25zaWRlciB2b3Rpbmcgd2VpZ2h0cywgd2hpY2ggYXJlIGFwcGxpZWQKZHVyaW5nIHRoZSB0YWxseWluZyBwaGFzZS4gQ2FsbGluZyB0aGlzIG9uIHRoZSBzbWFydCBjb250cmFjdCB3b3VsZCByZXZlYWwKdGhlIHZvdGVzIGFuZCBzZWVkcywgc28gaXQgbXVzdCBiZSBydW4gZWl0aGVyIGluIHNpbXVsYXRpb24gb3IgY2xpZW50LXNpZGUuCgojIEFyZ3VtZW50cwoqIGBlbnZgIC0gVGhlIGVudmlyb25tZW50IG9iamVjdAoqIGBwcm9qZWN0X2tleWAgLSBVbmlxdWUgaWRlbnRpZmllciBmb3IgdGhlIHByb2plY3QKKiBgdm90ZXNgIC0gVmVjdG9yIG9mIHZvdGUgY2hvaWNlcyAoMD1hcHByb3ZlLCAxPXJlamVjdCwgMj1hYnN0YWluKQoqIGBzZWVkc2AgLSBWZWN0b3Igb2YgcmFuZG9tIHNlZWRzIGZvciBlYWNoIHZvdGUKCiMgUmV0dXJucwoqIGBWZWM8Qnl0ZXNOPDk2Pj5gIC0gVmVjdG9yIG9mIHZvdGUgY29tbWl0bWVudHMgKG9uZSBwZXIgdm90ZSkKCiMgUGFuaWNzCiogSWYgbm8gYW5vbnltb3VzIHZvdGluZyBjb25maWd1cmF0aW9uIGV4aXN0cyBmb3IgdGhlIHByb2plY3QAAAAAABxidWlsZF9jb21taXRtZW50c19mcm9tX3ZvdGVzAAAAAwAAAAAAAAALcHJvamVjdF9rZXkAAAAADgAAAAAAAAAFdm90ZXMAAAAAAAPqAAAACgAAAAAAAAAFc2VlZHMAAAAAAAPqAAAACgAAAAEAAAPqAAAD7gAAAGA=",
        "AAAAAAAAAM1QYXVzZSBvciB1bnBhdXNlIHRoZSBjb250cmFjdCAoZW1lcmdlbmN5IHN0b3AuKQoKIyBBcmd1bWVudHMKKiBgZW52YCAtIFRoZSBlbnZpcm9ubWVudCBvYmplY3QKKiBgYWRtaW5gIC0gVGhlIGFkbWluIGFkZHJlc3MKKiBgcGF1c2VkYCAtIFBhdXNlIG9yIHVucGF1c2UgdGhlIGNvbnRyYWN0IG9wZXJhdGlvbnMgd2hpY2ggY2hhbmdlCmxlZGdlciBzdGF0ZXMuAAAAAAAABXBhdXNlAAAAAAAAAgAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAZwYXVzZWQAAAAAAAEAAAAA",
        "AAAAAAAAAFlHZXQgdGhlIGN1cnJlbnQgdmVyc2lvbiBvZiB0aGUgY29udHJhY3QuCgojIFJldHVybnMKKiBgdTMyYCAtIFRoZSBjb250cmFjdCB2ZXJzaW9uIG51bWJlcgAAAAAAAAd2ZXJzaW9uAAAAAAAAAAABAAAABA==",
        "AAAAAAAAAO9TZXQgdGhlIGNvbnRyYWN0IHJ1bm5pbmcgdGhlIG91dGNvbWUgY2FsbHMgb2YgcHJvcG9zYWxzLgoKVGhlIGV4ZWN1dG9yIGhhcyBubyB1cGdyYWRlOiBhIG5ldyBvbmUgaXMgZGVwbG95ZWQgYW5kIHNldCBoZXJlLgoKIyBBcmd1bWVudHMKKiBgZW52YCAtIFRoZSBlbnZpcm9ubWVudCBvYmplY3QKKiBgYWRtaW5gIC0gVGhlIGFkbWluIGFkZHJlc3MKKiBgZXhlY3V0b3JgIC0gVGhlIG5ldyBleGVjdXRvciBjb250cmFjdAAAAAAMc2V0X2V4ZWN1dG9yAAAAAgAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAhleGVjdXRvcgAAABMAAAAA",
        "AAAAAAAAAUNJbml0aWFsaXplIHRoZSBUYW5zdSBjb250cmFjdCB3aXRoIGFkbWluIGNvbmZpZ3VyYXRpb24uCgojIEFyZ3VtZW50cwoqIGBlbnZgIC0gVGhlIGVudmlyb25tZW50IG9iamVjdAoqIGBhZG1pbmAgLSBUaGUgYWRtaW4gYWRkcmVzcwoqIGBjb2xsYXRlcmFsYCAtIFRoZSBTdGVsbGFyIGFzc2V0IGNvbnRyYWN0IGRlcG9zaXRzIGFyZSBwYWlkIGluCiogYGV4ZWN1dG9yYCAtIFRoZSBjb250cmFjdCBydW5uaW5nIHRoZSBvdXRjb21lIGNhbGxzIG9mIHByb3Bvc2FscwoKIyBQYW5pY3MKKiBJZiBgY29sbGF0ZXJhbGAgaXMgbm90IGEgU3RlbGxhciBhc3NldCBjb250cmFjdAAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAMAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAKY29sbGF0ZXJhbAAAAAAAEwAAAAAAAAAIZXhlY3V0b3IAAAATAAAAAA==",
        "AAAAAAAAANVBcHByb3ZlIGFuIHVwZ3JhZGUgcHJvcG9zYWwKCiMgQXJndW1lbnRzCiogYGVudmAgLSBUaGUgZW52aXJvbm1lbnQgb2JqZWN0CiogYGFkbWluYCAtIEFuIGFkbWluIGFkZHJlc3MKCiMgUGFuaWNzCiogSWYgdGhlIGFkbWluIGlzIG5vdCBhdXRob3JpemVkCiogSWYgdGhlIGFkbWluIGFscmVhZHkgYXBwcm92ZWQKKiBJZiB0aGVyZSBpcyBubyB1cGdyYWRlIHRvIGFwcHJvdmUAAAAAAAAPYXBwcm92ZV91cGdyYWRlAAAAAAEAAAAAAAAABWFkbWluAAAAAAAAEwAAAAA=",
        "AAAAAAAAAU5Qcm9wb3NlIGEgY29udHJhY3QgdXBncmFkZS4KCiMgQXJndW1lbnRzCiogYGVudmAgLSBUaGUgZW52aXJvbm1lbnQgb2JqZWN0CiogYGFkbWluYCAtIEFuIGFkbWluIGFkZHJlc3MKKiBgbmV3X3dhc21faGFzaGAgLSBUaGUgbmV3IFdBU00gaGFzaAoqIGBuZXdfYWRtaW5zX2NvbmZpZ2AgLSBPcHRpb25hbCBuZXcgYWRtaW4gY29uZmlndXJhdGlvbiAoTm9uZSB0byBrZWVwIGN1cnJlbnQpCgojIFBhbmljcwoqIElmIHRoZSBhZG1pbiBpcyBub3QgYXV0aG9yaXplZAoqIElmIHRoZXJlIGlzIGFscmVhZHkgYW4gZXhpc3RpbmcgcHJvcG9zYWwgKGNhbmNlbCB0aGUgcHJldmlvdXMgZmlyc3QpAAAAAAAPcHJvcG9zZV91cGdyYWRlAAAAAAMAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAANbmV3X3dhc21faGFzaAAAAAAAA+4AAAAgAAAAAAAAABFuZXdfYWRtaW5zX2NvbmZpZwAAAAAAA+gAAAfQAAAADEFkbWluc0NvbmZpZwAAAAA=",
        "AAAAAAAAAgBFeGVjdXRlIG9yIGNhbmNlbCB1cGdyYWRlIHByb3Bvc2FsCgojIEFyZ3VtZW50cwoqIGBlbnZgIC0gVGhlIGVudmlyb25tZW50IG9iamVjdAoqIGBhZG1pbmAgLSBBbiBhZG1pbiBhZGRyZXNzCiogYGFjY2VwdGAgLSB0cnVlIHRvIGFjY2VwdCBhbmQgZmFsc2UgdG8gcmVqZWN0LgoKVXBncmFkZXMgY2FuIGFsd2F5cyBiZSBjYW5jZWxsZWQgYnV0IG9ubHkgZXhlY3V0ZWQgaWYgdGhlcmUgYXJlIGVub3VnaAphcHByb3ZhbHMgYW5kIHRoZSB0aW1lbG9jayBwZXJpb2QgaXMgb3Zlci4KTm90ZSB0aGF0IGN1cnJlbnQgZ292ZXJuYW5jZSBydWxlcyBhcHBseS4gTmV3IGNvbmZpZyBjaGFuZ2VzIG9ubHkKaW4gZm9yY2UgYWZ0ZXIgYW4gdXBkYXRlLgoKIyBQYW5pY3MKKiBJZiB0aGUgYWRtaW4gaXMgbm90IGF1dGhvcml6ZWQKKiBJZiBpdCBpcyB0b28gZWFybHkgdG8gZXhlY3V0ZQoqIElmIHRoZXJlIGFyZSBub3QgZW5vdWdoIGFwcHJvdmFscwoqIElmIHRoZXJlIGlzIG5vIHVwZ3JhZGUgdG8gZXhlY3V0ZQAAABBmaW5hbGl6ZV91cGdyYWRlAAAAAgAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAZhY2NlcHQAAAAAAAEAAAAA",
        "AAAAAAAAAJ1HZXQgY3VycmVudCBhZG1pbmlzdHJhdG9ycyBjb25maWd1cmF0aW9uLgoKIyBBcmd1bWVudHMKKiBgZW52YCAtIFRoZSBlbnZpcm9ubWVudCBvYmplY3QKCiMgUmV0dXJucwoqIGB0eXBlczo6QWRtaW5zQ29uZmlnYCAtIFRoZSBhZG1pbmlzdHJhdG9ycyBjb25maWd1cmF0aW9uAAAAAAAAEWdldF9hZG1pbnNfY29uZmlnAAAAAAAAAAAAAAEAAAfQAAAADEFkbWluc0NvbmZpZw==",
        "AAAAAAAAAF5SZXF1aXJlIHRoYXQgdGhlIGNvbnRyYWN0IGlzIG5vdCBwYXVzZWQsIHBhbmljIGlmIGl0IGlzCgojIFBhbmljcwoqIElmIHRoZSBjb250cmFjdCBpcyBwYXVzZWQuAAAAAAAScmVxdWlyZV9ub3RfcGF1c2VkAAAAAAAAAAAAAA==",
        "AAAAAAAAABxHZXQgdXBncmFkZSBwcm9wb3NhbCBkZXRhaWxzAAAAFGdldF91cGdyYWRlX3Byb3Bvc2FsAAAAAAAAAAEAAAfQAAAAD1VwZ3JhZGVQcm9wb3NhbAA=",
        "AAAAAAAAAsxBZGQgYSBuZXcgbWVtYmVyIHRvIHRoZSBzeXN0ZW0gd2l0aCBtZXRhZGF0YS4KCk9wdGlvbmFsbHkgYmluZHMgYSBHaXQgaWRlbnRpdHkuIFdoZW4gcHJvdmlkZWQsIHRoZSBpZGVudGl0eSBpcyB2ZXJpZmllZApieSBjaGVja2luZyBhbiBFZDI1NTE5IHNpZ25hdHVyZSBhZ2FpbnN0IHRoZSBjYWxsZXIncyBhZGRyZXNzLCBwdWJsaWMga2V5LAphbmQgaWRlbnRpdHkgc3RyaW5nLiBPbmx5IGBnaXRfaWRlbnRpdHlgIGFuZCBgZ2l0X3B1YmtleWAgYXJlIHBlcnNpc3RlZC4KCiMgQXJndW1lbnRzCiogYGVudmAgLSBUaGUgZW52aXJvbm1lbnQgb2JqZWN0CiogYG1lbWJlcl9hZGRyZXNzYCAtIFRoZSBhZGRyZXNzIG9mIHRoZSBtZW1iZXIgdG8gYWRkCiogYG1ldGFgIC0gTWV0YWRhdGEgc3RyaW5nIGFzc29jaWF0ZWQgd2l0aCB0aGUgbWVtYmVyIChlLmcuLCBJUEZTIGhhc2gpCiogYGdpdF9pZGVudGl0eWAgLSBHaXQgaGFuZGxlIChlLmcuLCAiZ2l0aHViOmFsaWNlIikKKiBgZ2l0X3B1YmtleWAgLSBFZDI1NTE5IHB1YmxpYyBrZXkKKiBgZ2l0X3NpZ2AgLSBFZDI1NTE5IHNpZ25hdHVyZQoKIyBQYW5pY3MKKiBJZiB0aGUgbWVtYmVyIGFscmVhZHkgZXhpc3RzCiogSWYgZ2l0IHBhcmFtcyBhcmUgaW5jb21wbGV0ZSAoaWRlbnRpdHksIGtleSwgc2lnIG11c3QgYmUgYWxsIFNvbWUgb3IgTm9uZSkKKiBJZiB0aGUgc2lnbmF0dXJlIHZlcmlmaWNhdGlvbiBmYWlscwAAAAphZGRfbWVtYmVyAAAAAAAFAAAAAAAAAA5tZW1iZXJfYWRkcmVzcwAAAAAAEwAAAAAAAAAEbWV0YQAAABAAAAAAAAAADGdpdF9pZGVudGl0eQAAA+gAAAAQAAAAAAAAAApnaXRfcHVia2V5AAAAAAPoAAAD7gAAACAAAAAAAAAAB2dpdF9zaWcAAAAD6AAAA+4AAABAAAAAAA==",
        "AAAAAAAAAWVHZXQgYWxsIGJhZGdlcyBmb3IgYSBzcGVjaWZpYyBwcm9qZWN0LCBvcmdhbml6ZWQgYnkgYmFkZ2UgdHlwZS4KClJldHVybnMgYSBzdHJ1Y3R1cmUgY29udGFpbmluZyB2ZWN0b3JzIG9mIG1lbWJlciBhZGRyZXNzZXMgZm9yIGVhY2ggYmFkZ2UgdHlwZQooRGV2ZWxvcGVyLCBUcmlhZ2UsIENvbW11bml0eSwgVmVyaWZpZWQpLgoKIyBBcmd1bWVudHMKKiBgZW52YCAtIFRoZSBlbnZpcm9ubWVudCBvYmplY3QKKiBga2V5YCAtIFRoZSBwcm9qZWN0IGtleSBpZGVudGlmaWVyCgojIFJldHVybnMKKiBgdHlwZXM6OkJhZGdlc2AgLSBTdHJ1Y3R1cmUgY29udGFpbmluZyBtZW1iZXIgYWRkcmVzc2VzIGZvciBlYWNoIGJhZGdlIHR5cGUAAAAAAAAKZ2V0X2JhZGdlcwAAAAAAAQAAAAAAAAADa2V5AAAAAA4AAAABAAAH0AAAAAZCYWRnZXMAAA==",
        "AAAAAAAAAR1HZXQgbWVtYmVyIGluZm9ybWF0aW9uIGluY2x1ZGluZyBhbGwgcHJvamVjdCBiYWRnZXMuCgojIEFyZ3VtZW50cwoqIGBlbnZgIC0gVGhlIGVudmlyb25tZW50IG9iamVjdAoqIGBtZW1iZXJfYWRkcmVzc2AgLSBUaGUgYWRkcmVzcyBvZiB0aGUgbWVtYmVyIHRvIHJldHJpZXZlCgojIFJldHVybnMKKiBgdHlwZXM6Ok1lbWJlcmAgLSBNZW1iZXIgaW5mb3JtYXRpb24gaW5jbHVkaW5nIG1ldGFkYXRhIGFuZCBwcm9qZWN0IGJhZGdlcwoKIyBQYW5pY3MKKiBJZiB0aGUgbWVtYmVyIGRvZXNuJ3QgZXhpc3QAAAAAAAAKZ2V0X21lbWJlcgAAAAAAAQAAAAAAAAAObWVtYmVyX2FkZHJlc3MAAAAAABMAAAABAAAH0AAAAAZNZW1iZXIAAA==",
        "AAAAAAAAAtVTZXQgYmFkZ2VzIGZvciBhIG1lbWJlciBpbiBhIHNwZWNpZmljIHByb2plY3QuCgpUaGlzIGZ1bmN0aW9uIHJlcGxhY2VzIGFsbCBleGlzdGluZyBiYWRnZXMgZm9yIHRoZSBtZW1iZXIgaW4gdGhlIHNwZWNpZmllZCBwcm9qZWN0CndpdGggdGhlIG5ldyBiYWRnZSBsaXN0LiBSZXBlYXRlZCBiYWRnZXMgY291bnQgb25jZSwgYW5kIGFuIGVtcHR5IGxpc3QKcmVtb3ZlcyB0aGUgcHJvamVjdCBmcm9tIHRoZSBtZW1iZXIncyByZWNvcmQuIFRoZSBtZW1iZXIncyBtYXhpbXVtCnZvdGluZyB3ZWlnaHQgaXMgY2FsY3VsYXRlZCBhcyB0aGUgc3VtIG9mIGFsbCBhc3NpZ25lZCBiYWRnZSB3ZWlnaHRzLgoKIyBBcmd1bWVudHMKKiBgZW52YCAtIFRoZSBlbnZpcm9ubWVudCBvYmplY3QKKiBgbWFpbnRhaW5lcmAgLSBUaGUgYWRkcmVzcyBvZiB0aGUgbWFpbnRhaW5lciAobXVzdCBiZSBhdXRob3JpemVkKQoqIGBrZXlgIC0gVGhlIHByb2plY3Qga2V5IGlkZW50aWZpZXIKKiBgbWVtYmVyYCAtIFRoZSBhZGRyZXNzIG9mIHRoZSBtZW1iZXIgdG8gc2V0IGJhZGdlcyBmb3IKKiBgYmFkZ2VzYCAtIFZlY3RvciBvZiBiYWRnZXMgdG8gYXNzaWduCgojIFBhbmljcwoqIElmIHRoZSBtYWludGFpbmVyIGlzIG5vdCBhdXRob3JpemVkCiogSWYgdGhlIG1lbWJlciBkb2Vzbid0IGV4aXN0CiogSWYgdGhlIHByb2plY3QgZG9lc24ndCBleGlzdAoqIElmIGBiYWRnZXNgIGhvbGRzIGBEZWZhdWx0YAAAAAAAAApzZXRfYmFkZ2VzAAAAAAAEAAAAAAAAAAptYWludGFpbmVyAAAAAAATAAAAAAAAAANrZXkAAAAADgAAAAAAAAAGbWVtYmVyAAAAAAATAAAAAAAAAAZiYWRnZXMAAAAAA+oAAAfQAAAABUJhZGdlAAAAAAAAAA==",
        "AAAAAAAAAmFVcGRhdGUgdGhlIG1ldGFkYXRhIGFuZCBvcHRpb25hbGx5IHRoZSBHaXQgaWRlbnRpdHkgb2YgYW4gZXhpc3RpbmcgbWVtYmVyLgoKV2hlbiBgZ2l0X2lkZW50aXR5YCBpcyBgU29tZWAsIHRoZSBzaWduYXR1cmUgaXMgdmVyaWZpZWQgdGhlIHNhbWUgd2F5CmFzIGluIGBhZGRfbWVtYmVyYCB0byBwcmV2ZW50IGlkZW50aXR5IGltcGVyc29uYXRpb24uCgojIEFyZ3VtZW50cwoqIGBlbnZgIC0gVGhlIGVudmlyb25tZW50IG9iamVjdAoqIGBtZW1iZXJfYWRkcmVzc2AgLSBUaGUgYWRkcmVzcyBvZiB0aGUgbWVtYmVyIHRvIHVwZGF0ZQoqIGBtZXRhYCAtIE5ldyBtZXRhZGF0YSBzdHJpbmcKKiBgZ2l0X2lkZW50aXR5YCAtIEdpdCBoYW5kbGUgKGUuZy4sICJnaXRodWI6YWxpY2UiKQoqIGBnaXRfcHVia2V5YCAtIEVkMjU1MTkgcHVibGljIGtleQoqIGBnaXRfc2lnYCAtIEVkMjU1MTkgc2lnbmF0dXJlCgojIFBhbmljcwoqIElmIHRoZSBtZW1iZXIgZG9lc24ndCBleGlzdAoqIElmIGdpdCBwYXJhbXMgYXJlIGluY29tcGxldGUgKGlkZW50aXR5LCBrZXksIHNpZyBtdXN0IGJlIGFsbCBTb21lIG9yIE5vbmUpCiogSWYgdGhlIHNpZ25hdHVyZSB2ZXJpZmljYXRpb24gZmFpbHMAAAAAAAANdXBkYXRlX21lbWJlcgAAAAAAAAUAAAAAAAAADm1lbWJlcl9hZGRyZXNzAAAAAAATAAAAAAAAAARtZXRhAAAAEAAAAAAAAAAMZ2l0X2lkZW50aXR5AAAD6AAAABAAAAAAAAAACmdpdF9wdWJrZXkAAAAAA+gAAAPuAAAAIAAAAAAAAAAHZ2l0X3NpZwAAAAPoAAAD7gAAAEAAAAAA",
        "AAAAAAAAAi5HZXQgdGhlIG1heGltdW0gdm90aW5nIHdlaWdodCBmb3IgYW4gYWRkcmVzcyBpbiBhIHNwZWNpZmljIHByb2plY3QuCgpDYWxjdWxhdGVzIHRoZSBzdW0gb2YgYWxsIGJhZGdlIHdlaWdodHMgZm9yIHRoZSBhZGRyZXNzIGluIHRoZSBwcm9qZWN0LgpSZXR1cm5zIHRoZSBEZWZhdWx0IGJhZGdlIHdlaWdodCAoMSkgaWYgdGhlIGFkZHJlc3MgaGFzIG5vIGJhZGdlcwphc3NpZ25lZCBvciBpcyBub3QgYSByZWdpc3RlcmVkIG1lbWJlci4KCkEgcHJvamVjdCB3aXRoIGFuIE5RRyBjb250cmFjdCBzZXQgKHNlZSBgc2V0X25xZ19jb250cmFjdGApIHVzZXMgdGhlCndlaWdodCB0aGF0IGNvbnRyYWN0IGdpdmVzIGluc3RlYWQgb2YgYmFkZ2VzLgoKIyBBcmd1bWVudHMKKiBgZW52YCAtIFRoZSBlbnZpcm9ubWVudCBvYmplY3QKKiBgcHJvamVjdF9rZXlgIC0gVGhlIHByb2plY3Qga2V5IGlkZW50aWZpZXIKKiBgbWVtYmVyX2FkZHJlc3NgIC0gVGhlIGFkZHJlc3MgdG8gY2hlY2sKCiMgUmV0dXJucwoqIGB1MzJgIC0gVGhlIG1heGltdW0gdm90aW5nIHdlaWdodCBmb3IgdGhlIGFkZHJlc3MAAAAAAA5nZXRfbWF4X3dlaWdodAAAAAAAAgAAAAAAAAALcHJvamVjdF9rZXkAAAAADgAAAAAAAAAObWVtYmVyX2FkZHJlc3MAAAAAABMAAAABAAAABA==",
        "AAAAAAAAACpHZXQgdGhlIE5RRyBjb250cmFjdCBvZiBhIHByb2plY3QsIGlmIGFueS4AAAAAABBnZXRfbnFnX2NvbnRyYWN0AAAAAQAAAAAAAAALcHJvamVjdF9rZXkAAAAADgAAAAEAAAPoAAAH0AAAAAtDb250cmFjdFJlZgA=",
        "AAAAAAAAAk5TZXQsIG9yIGNsZWFyLCB0aGUgTlFHIGNvbnRyYWN0IGdpdmluZyB0aGUgdm90aW5nIHdlaWdodHMgb2YgYSBwcm9qZWN0LgoKV2hlbiBzZXQsIGBnZXRfbWF4X3dlaWdodGAgcmV0dXJucyB0aGUgY29udHJhY3QncwpgZ2V0X3ZvdGluZ19wb3dlcih1c2VyOiBBZGRyZXNzKSAtPiB1MzJgIGZvciB0aGUgcHJvamVjdCwgYW5kIGJhZGdlcwphcmUgbm90IHVzZWQuIEEgd2VpZ2h0IG9mIDAgbWVhbnMgdGhlIGFkZHJlc3MgY2Fubm90IHZvdGUuIEEgY2FsbCB0aGF0CmZhaWxzIHJlYWRzIGFzIDAuCgojIEFyZ3VtZW50cwoqIGBlbnZgIC0gVGhlIGVudmlyb25tZW50IG9iamVjdAoqIGBtYWludGFpbmVyYCAtIEEgbWFpbnRhaW5lciBvZiB0aGUgcHJvamVjdAoqIGBwcm9qZWN0X2tleWAgLSBUaGUgcHJvamVjdCBrZXkgaWRlbnRpZmllcgoqIGBucWdfY29udHJhY3RgIC0gVGhlIE5RRyBjb250cmFjdCwgb3IgYE5vbmVgIHRvIHVzZSBiYWRnZXMgYWdhaW4KCiMgUGFuaWNzCiogSWYgdGhlIG1haW50YWluZXIgaXMgbm90IGF1dGhvcml6ZWQKKiBJZiB0aGUgY29udHJhY3QncyBXQVNNIGhhc2ggZG9lcyBub3QgbWF0Y2ggdGhlIGdpdmVuIG9uZQAAAAAAEHNldF9ucWdfY29udHJhY3QAAAADAAAAAAAAAAptYWludGFpbmVyAAAAAAATAAAAAAAAAAtwcm9qZWN0X2tleQAAAAAOAAAAAAAAAAxucWdfY29udHJhY3QAAAPoAAAH0AAAAAtDb250cmFjdFJlZgAAAAAA",
        "AAAAAAAABABSZWNvcmQgYW4gZW5kb3JzZW1lbnQgKGF0dGVzdGF0aW9uKSBvZiBhIGNvbW1pdCBvciBldmlkZW5jZSBhcnRpZmFjdC4KCkEgbXVsdGktcGFydHkgcHJpbWl0aXZlOiBpbmRlcGVuZGVudCBtYWludGFpbmVycyB2b3VjaCB0aGF0IHRoZXkgdmVyaWZpZWQgdGhlCnRhcmdldC4gRWFjaCBtYWludGFpbmVyIG1heSBhdHRlc3QgYSBnaXZlbiB0YXJnZXQgYXQgbW9zdCBvbmNlIOKAlCBhIHNlY29uZApjYWxsIGZyb20gdGhlIHNhbWUgYXR0ZXN0ZXIgaXMgcmVqZWN0ZWQgcmF0aGVyIHRoYW4gcmVwbGFjaW5nIHRoZSBmaXJzdCwgc28KYW4gYXR0ZXN0YXRpb24gaXMgbmV2ZXIgc2lsZW50bHkgcmV3cml0dGVuLiBSZXZva2luZyBvbmUgaXMgYW4gZXhwbGljaXQsCnNlcGFyYXRlbHkgZXZlbnRlZCBhY3Rpb246IHNlZSBgcmV2b2tlX2F0dGVzdGF0aW9uYC4gQXQgbW9zdApgTUFYX0FUVEVTVEFUSU9OU2AgYXJlIGtlcHQgb24tY2hhaW47IGF0IGNhcGFjaXR5LCB2b3VjaGVzIGZyb20gYWRkcmVzc2VzCnRoYXQgYXJlIG5vIGxvbmdlciBtYWludGFpbmVycyBhcmUgcHJ1bmVkLCBhbmQgdGhlIGNhbGwgaXMgcmVqZWN0ZWQgaWYKdGhhdCBkb2VzIG5vdCBmcmVlIGEgc2xvdC4gQ3VycmVudCBtYWludGFpbmVycycgdm91Y2hlcyBhcmUgbmV2ZXIgZXZpY3RlZC4KCiMgQXJndW1lbnRzCiogYGVudmAgLSBUaGUgZW52aXJvbm1lbnQgb2JqZWN0CiogYGF0dGVzdGVyYCAtIFRoZSBtYWludGFpbmVyIHJlY29yZGluZyB0aGUgYXR0ZXN0YXRpb24KKiBgcHJvamVjdF9rZXlgIC0gVGhlIHByb2plY3Qga2V5IGlkZW50aWZpZXIKKiBgY29tbWl0X2hhc2hgIC0gVGhlIGNvbW1pdCBoYXNoIGJlaW5nIGVuZG9yc2VkCiogYHRhcmdldGAgLSBUaGUgYXR0ZXN0YXRpb24gdGFyZ2V0OiB0aGUgY29tbWl0IG9yIGEgc3BlY2lmaWMgZXZpZGVuY2UgYXJ0aWZhY3QKKiBgbm90ZWAgLSBPcHRpb25hbCBwb2ludGVyIChlLmcuIGEgcmVwcm9kdWNpYmlsaXR5IHJlcG9ydCBDSUQpCgojIFBhbmljcwoqIElmIHRoZSBjb250cmFjdCBpAAAABmF0dGVzdAAAAAAABQAAAAAAAAAIYXR0ZXN0ZXIAAAATAAAAAAAAAAtwcm9qZWN0X2tleQAAAAAOAAAAAAAAAAtjb21taXRfaGFzaAAAAAAQAAAAAAAAAAZ0YXJnZXQAAAAAB9AAAAARQXR0ZXN0YXRpb25UYXJnZXQAAAAAAAAAAAAABG5vdGUAAAPoAAAAEAAAAAA=",
        "AAAAAAAAAb9TZXQgdGhlIGxhdGVzdCBjb21taXQgaGFzaCBmb3IgYSBwcm9qZWN0LgoKVXBkYXRlcyB0aGUgY3VycmVudCBjb21taXQgaGFzaCBmb3IgdGhlIHNwZWNpZmllZCBwcm9qZWN0LgoKIyBBcmd1bWVudHMKKiBgZW52YCAtIFRoZSBlbnZpcm9ubWVudCBvYmplY3QKKiBgbWFpbnRhaW5lcmAgLSBUaGUgYWRkcmVzcyBvZiB0aGUgbWFpbnRhaW5lciBjYWxsaW5nIHRoaXMgZnVuY3Rpb24KKiBgcHJvamVjdF9rZXlgIC0gVGhlIHByb2plY3Qga2V5IGlkZW50aWZpZXIKKiBgaGFzaGAgLSBUaGUgbmV3IGNvbW1pdCBoYXNoCgojIFBhbmljcwoqIElmIHRoZSBwcm9qZWN0IGRvZXNuJ3QgZXhpc3QKKiBJZiB0aGUgbWFpbnRhaW5lciBpcyBub3QgYXV0aG9yaXplZAoqIElmIHRoZSBoYXNoIGlzIG5vdCBhIHZhbGlkIFNIQS0xICg0MCBoZXgpIG9yIFNIQS0yNTYgKDY0IGhleCkgb2JqZWN0IG5hbWUAAAAABmNvbW1pdAAAAAAAAwAAAAAAAAAKbWFpbnRhaW5lcgAAAAAAEwAAAAAAAAALcHJvamVjdF9rZXkAAAAADgAAAAAAAAAEaGFzaAAAABAAAAAA",
        "AAAAAAAABABSZWdpc3RlciBhIG5ldyBwcm9qZWN0LgoKQ3JlYXRlcyBhIG5ldyBwcm9qZWN0IGVudHJ5IHdpdGggbWFpbnRhaW5lcnMsIFVSTCwgYW5kIG1ldGFkYXRhLgpUaGUgcHJvamVjdCBrZXkgaXMgZ2VuZXJhdGVkIHVzaW5nIGtlY2NhazI1NiBoYXNoIG9mIHRoZSBwcm9qZWN0IG5hbWUuCgojIEFyZ3VtZW50cwoqIGBlbnZgIC0gVGhlIGVudmlyb25tZW50IG9iamVjdAoqIGBtYWludGFpbmVyYCAtIFRoZSBhZGRyZXNzIG9mIHRoZSBtYWludGFpbmVyIGNhbGxpbmcgdGhpcyBmdW5jdGlvbgoqIGBuYW1lYCAtIFRoZSBwcm9qZWN0IG5hbWUsIDQgdG8gMzAgbGV0dGVycyBhbmQgZGlnaXRzCiogYG1haW50YWluZXJzYCAtIExpc3Qgb2YgbWFpbnRhaW5lciBhZGRyZXNzZXMgZm9yIHRoZSBwcm9qZWN0CiogYHVybGAgLSBUaGUgcHJvamVjdCdzIEdpdCByZXBvc2l0b3J5IFVSTAoqIGBpcGZzYCAtIENJRCBvZiB0aGUgdGFuc3UudG9tbCBmaWxlIHdpdGggYXNzb2NpYXRlZCBtZXRhZGF0YQoqIGBtaW5fdm90aW5nX3BlcmlvZGAgLSBPcHRpb25hbCBtaW5pbXVtIHZvdGluZyBwZXJpb2Qgb3ZlcnJpZGUsIGluIHNlY29uZHMKKiBgZXhlY3V0ZV9kZWxheWAgLSBPcHRpb25hbCBEQU8gZXhlY3V0ZSB0aW1lbG9jayBvdmVycmlkZSwgaW4gc2Vjb25kcwoqIGBhdHRlc3RhdGlvbl90aHJlc2hvbGRgIC0gT3B0aW9uYWwgZmluYWxpdHkgdGhyZXNob2xkIHBlcmNlbnQ7IHdoZW4KYE5vbmVgIHRoZSBwcm9qZWN0IGlzIHNldCB0byBgREVGQVVMVF9GSU5BTElUWV9USFJFU0hPTERfUEVSQ0VOVGAuIENhbgpiZSBjaGFuZ2VkIGxhdGVyIHdpdGggYHNldF9hdHRlc3RhdGlvbl90aHJlc2hvbGRgLgoKIyBSZXR1cm5zCiogYEJ5dGVzYCAtIFRoZSBwcm9qZWN0IGtleSAoa2VjY2FrMjU2IGhhc2ggb2YgdGhlIG5hbWUpCgojIFBhbmljcwoqIElmIHRoZSBwcm9qZWN0IG5hbWUgaXMgbm90IDQgdG8gMzAgbGV0dGVycyBhbmQgZGlnaXRzCiogSWYgYHVybGAgb3IgYGlwZnNgIGlzIGxvbmdlciB0aGFuIDI1NiBieXRlcwoqIElmAAAACHJlZ2lzdGVyAAAACAAAAAAAAAAKbWFpbnRhaW5lcgAAAAAAEwAAAAAAAAAEbmFtZQAAABAAAAAAAAAAC21haW50YWluZXJzAAAAA+oAAAATAAAAAAAAAAN1cmwAAAAAEAAAAAAAAAAEaXBmcwAAABAAAAAAAAAAEW1pbl92b3RpbmdfcGVyaW9kAAAAAAAD6AAAAAYAAAAAAAAADWV4ZWN1dGVfZGVsYXkAAAAAAAPoAAAABgAAAAAAAAAVYXR0ZXN0YXRpb25fdGhyZXNob2xkAAAAAAAD6AAAAAQAAAABAAAADg==",
        "AAAAAAAAAN1HZXQgdGhlIGxhdGVzdCBjb21taXQgaGFzaCBmb3IgYSBwcm9qZWN0LgoKIyBBcmd1bWVudHMKKiBgZW52YCAtIFRoZSBlbnZpcm9ubWVudCBvYmplY3QKKiBgcHJvamVjdF9rZXlgIC0gVGhlIHByb2plY3Qga2V5IGlkZW50aWZpZXIKCiMgUmV0dXJucwoqIGBTdHJpbmdgIC0gVGhlIGN1cnJlbnQgY29tbWl0IGhhc2gKCiMgUGFuaWNzCiogSWYgdGhlIHByb2plY3QgZG9lc24ndCBleGlzdAAAAAAAAApnZXRfY29tbWl0AAAAAAABAAAAAAAAAAtwcm9qZWN0X2tleQAAAAAOAAAAAQAAABA=",
        "AAAAAAAAASBHZXQgcHJvamVjdCBpbmZvcm1hdGlvbiBpbmNsdWRpbmcgY29uZmlndXJhdGlvbiBhbmQgbWFpbnRhaW5lcnMuCgojIEFyZ3VtZW50cwoqIGBlbnZgIC0gVGhlIGVudmlyb25tZW50IG9iamVjdAoqIGBwcm9qZWN0X2tleWAgLSBUaGUgcHJvamVjdCBrZXkgaWRlbnRpZmllcgoKIyBSZXR1cm5zCiogYHR5cGVzOjpQcm9qZWN0YCAtIFByb2plY3QgaW5mb3JtYXRpb24gaW5jbHVkaW5nIG5hbWUsIGNvbmZpZywgYW5kIG1haW50YWluZXJzCgojIFBhbmljcwoqIElmIHRoZSBwcm9qZWN0IGRvZXNuJ3QgZXhpc3QAAAALZ2V0X3Byb2plY3QAAAAAAQAAAAAAAAALcHJvamVjdF9rZXkAAAAADgAAAAEAAAfQAAAAB1Byb2plY3QA",
        "AAAAAAAAAk5HZXQgdGhlIHN0b3JlZCBldmlkZW5jZSBoaXN0b3J5IGZvciBhIHNwZWNpZmljIHByb2plY3QgY29tbWl0IGFuZCBraW5kLgoKRW50cmllcyBhcmUgcmV0dXJuZWQgb2xkZXN0LWZpcnN0ICh0aGUgbGFzdCBlbGVtZW50IGlzIHRoZSBsYXRlc3QpLCBhbmQgYXQKbW9zdCBgTUFYX0VWSURFTkNFYCBhcmUga2VwdCBvbi1jaGFpbi4gUmV0dXJucyBhbiBlbXB0eSB2ZWN0b3Igd2hlbiBubwpldmlkZW5jZSBoYXMgYmVlbiByZWNvcmRlZDsgY29uc3VtZXJzIHJlY29uc3RydWN0IHRoZSBmdWxsIGhpc3RvcnkgZnJvbQpgRXZpZGVuY2VTZXRgIGV2ZW50cyB2aWEgYW4gaW5kZXhlci4KCiMgQXJndW1lbnRzCiogYGVudmAgLSBUaGUgZW52aXJvbm1lbnQgb2JqZWN0CiogYHByb2plY3Rfa2V5YCAtIFRoZSBwcm9qZWN0IGtleSBpZGVudGlmaWVyCiogYGNvbW1pdF9oYXNoYCAtIFRoZSBjb21taXQgaGFzaCB0aGlzIGV2aWRlbmNlIGRlc2NyaWJlcwoqIGBraW5kYCAtIFRoZSBldmlkZW5jZSBjYXRlZ29yeQoKIyBSZXR1cm5zCiogYFZlYzx0eXBlczo6RXZpZGVuY2U+YCAtIFRoZSBzdG9yZWQgZXZpZGVuY2UgcG9pbnRlcnMsIG9sZGVzdC1maXJzdAAAAAAADGdldF9ldmlkZW5jZQAAAAMAAAAAAAAAC3Byb2plY3Rfa2V5AAAAAA4AAAAAAAAAC2NvbW1pdF9oYXNoAAAAABAAAAAAAAAABGtpbmQAAAfQAAAADEV2aWRlbmNlS2luZAAAAAEAAAPqAAAH0AAAAAhFdmlkZW5jZQ==",
        "AAAAAAAAALZHZXQgYSBwYWdlIG9mIHByb2plY3RzLgoKIyBBcmd1bWVudHMKKiBgZW52YCAtIFRoZSBlbnZpcm9ubWVudCBvYmplY3QKKiBgcGFnZWAgLSBUaGUgcGFnZSBudW1iZXIgKDAtYmFzZWQpCgojIFJldHVybnMKKiBgVmVjPHR5cGVzOjpQcm9qZWN0PmAgLSBMaXN0IG9mIHByb2plY3RzIG9uIHRoZSByZXF1ZXN0ZWQgcGFnZQAAAAAADGdldF9wcm9qZWN0cwAAAAEAAAAAAAAABHBhZ2UAAAAEAAAAAQAAA+oAAAfQAAAAB1Byb2plY3QA",
        "AAAAAAAAA95TdG9yZSBnZW5lcmljIGV4dGVybmFsIGV2aWRlbmNlIGZvciBhIHNwZWNpZmljIHByb2plY3QgY29tbWl0IGFuZCBldmlkZW5jZSBraW5kLgoKU3RvcmVzIG9ubHkgdGhlIHZlcmlmaWFibGUgSVBGUyBwb2ludGVyLiBFdmlkZW5jZSBjb250ZW50cyByZW1haW4gb2ZmLWNoYWluLgoKRXZpZGVuY2UgaXMgYXBwZW5kLW9ubHk6IGVhY2ggY2FsbCBhZGRzIGEgbmV3IGVudHJ5IHRvIHRoZSBoaXN0b3J5IGZvcgpgKHByb2plY3Rfa2V5LCBjb21taXRfaGFzaCwga2luZClgIHJhdGhlciB0aGFuIG92ZXJ3cml0aW5nIHRoZSBwcmV2aW91cwpvbmUgKGUuZy4gc3VjY2Vzc2l2ZSBDVkUgcmUtc2NhbnMgb2YgdGhlIHNhbWUgY29tbWl0KS4gQXQgbW9zdApgTUFYX0VWSURFTkNFYCBlbnRyaWVzIGFyZSBrZXB0IG9uLWNoYWluOyBvbGRlciBvbmVzIHJvbGwgb2ZmIGJ1dCByZW1haW4KcmVjb3ZlcmFibGUgZnJvbSBgRXZpZGVuY2VTZXRgIGV2ZW50cyB2aWEgYW4gaW5kZXhlci4KCiMgQXJndW1lbnRzCiogYGVudmAgLSBUaGUgZW52aXJvbm1lbnQgb2JqZWN0CiogYG1haW50YWluZXJgIC0gVGhlIGFkZHJlc3Mgb2YgdGhlIG1haW50YWluZXIgY2FsbGluZyB0aGlzIGZ1bmN0aW9uCiogYHByb2plY3Rfa2V5YCAtIFRoZSBwcm9qZWN0IGtleSBpZGVudGlmaWVyCiogYGNvbW1pdF9oYXNoYCAtIFRoZSBjb21taXQgaGFzaCB0aGlzIGV2aWRlbmNlIGRlc2NyaWJlcwoqIGBraW5kYCAtIFRoZSBldmlkZW5jZSBjYXRlZ29yeQoqIGBjaWRgIC0gVGhlIG9mZi1jaGFpbiBjb250ZW50IGlkZW50aWZpZXIKCiMgUGFuaWNzCiogSWYgdGhlIGNvbnRyYWN0IGlzIHBhdXNlZAoqIElmIHRoZSBwcm9qZWN0IGRvZXNuJ3QgZXhpc3QKKiBJZiB0aGUgbWFpbnRhaW5lciBpcyBub3QgYXV0aG9yaXplZAoqIElmIGNvbW1pdF9oYXNoIGlzIG5vdCBhIHZhbGlkIFNIQS0xICg0MCBoZXgpIG9yIFNIQS0yNTYgKDY0IGhleCkgb2JqZWN0IG5hbWUKKiBJZiBjaWQgaXMgZW1wdHkAAAAAAAxzZXRfZXZpZGVuY2UAAAAFAAAAAAAAAAptYWludGFpbmVyAAAAAAATAAAAAAAAAAtwcm9qZWN0X2tleQAAAAAOAAAAAAAAAAtjb21taXRfaGFzaAAAAAAQAAAAAAAAAARraW5kAAAH0AAAAAxFdmlkZW5jZUtpbmQAAAAAAAAAA2NpZAAAAAAQAAAAAA==",
        "AAAAAAAABABVcGRhdGUgdGhlIGNvbmZpZ3VyYXRpb24gb2YgYW4gZXhpc3RpbmcgcHJvamVjdC4KCkNoYW5nZXMgdGhlIHByb2plY3QncyBVUkwsIElQRlMgbWV0YWRhdGEsIGFuZCBtYWludGFpbmVyIGxpc3QsIGFuZApvcHRpb25hbGx5IGl0cyBnb3Zlcm5hbmNlIG92ZXJyaWRlcy4gYE5vbmVgIGdvdmVybmFuY2UgcGFyYW1zIGxlYXZlCnRoZSBjdXJyZW50IHZhbHVlcyB1bnRvdWNoZWQ7IHRvIHJlc3RvcmUgYSBkZWZhdWx0LCBwYXNzIGl0IGV4cGxpY2l0bHkuCgpUaWdodGVuaW5nIChuZXcgPj0gY3VycmVudCkgYXBwbGllcyBpbW1lZGlhdGVseTsgbG9vc2VuaW5nIGFjdGl2YXRlcwphZnRlciBhIG5vdGljZSB3aW5kb3cgb2YgY3VycmVudCBgbWluX3ZvdGluZ19wZXJpb2QgKyBleGVjdXRlX2RlbGF5YC4KSW4tZmxpZ2h0IHByb3Bvc2FscyBrZWVwIHRoZWlyIGNyZWF0aW9uLXRpbWUgdGltZWxvY2suCgojIEFyZ3VtZW50cwoqIGBlbnZgIC0gVGhlIGVudmlyb25tZW50IG9iamVjdAoqIGBtYWludGFpbmVyYCAtIFRoZSBhZGRyZXNzIG9mIHRoZSBtYWludGFpbmVyIGNhbGxpbmcgdGhpcyBmdW5jdGlvbgoqIGBrZXlgIC0gVGhlIHByb2plY3Qga2V5IGlkZW50aWZpZXIKKiBgbWFpbnRhaW5lcnNgIC0gTmV3IGxpc3Qgb2YgbWFpbnRhaW5lciBhZGRyZXNzZXMKKiBgdXJsYCAtIE5ldyBHaXQgcmVwb3NpdG9yeSBVUkwKKiBgaXBmc2AgLSBOZXcgQ0lEIG9mIHRoZSB0YW5zdS50b21sIGZpbGUgd2l0aCBtZXRhZGF0YQoqIGBtaW5fdm90aW5nX3BlcmlvZGAgLSBPcHRpb25hbCBuZXcgbWluaW11bSB2b3RpbmcgcGVyaW9kLCBpbiBzZWNvbmRzCiogYGV4ZWN1dGVfZGVsYXlgIC0gT3B0aW9uYWwgbmV3IERBTyBleGVjdXRlIHRpbWVsb2NrLCBpbiBzZWNvbmRzCiogYGF0dGVzdGF0aW9uX3RocmVzaG9sZGAgLSBPcHRpb25hbCBuZXcgZmluYWxpdHkgdGhyZXNob2xkIHBlcmNlbnQ7CndoZW4gYE5vbmVgIHRoZSBwcm9qZWN0J3MgY3VycmVudCB0aHJlc2hvbGQgaXMgbGVmdCB1bmNoYW5nZWQKCiMgUGFuaWNzCiogAAAADXVwZGF0ZV9jb25maWcAAAAAAAAIAAAAAAAAAAptYWludGFpbmVyAAAAAAATAAAAAAAAAANrZXkAAAAADgAAAAAAAAALbWFpbnRhaW5lcnMAAAAD6gAAABMAAAAAAAAAA3VybAAAAAAQAAAAAAAAAARpcGZzAAAAEAAAAAAAAAARbWluX3ZvdGluZ19wZXJpb2QAAAAAAAPoAAAABgAAAAAAAAANZXhlY3V0ZV9kZWxheQAAAAAAA+gAAAAGAAAAAAAAABVhdHRlc3RhdGlvbl90aHJlc2hvbGQAAAAAAAPoAAAABAAAAAA=",
        "AAAAAAAAAqBHZXQgdGhlIGF0dGVzdGF0aW9ucyByZWNvcmRlZCBmb3IgYSBwcm9qZWN0J3MgY29tbWl0IG9yIGV2aWRlbmNlIHRhcmdldC4KCkVudHJpZXMgYXJlIHJldHVybmVkIG9sZGVzdC1maXJzdCAodGhlIGxhc3QgZWxlbWVudCBpcyB0aGUgbW9zdCByZWNlbnQpIGFuZApob2xkIGF0IG1vc3Qgb25lIGVudHJ5IHBlciBhdHRlc3RlciwgY2FwcGVkIGF0IGBNQVhfQVRURVNUQVRJT05TYC4gVGhlIGZ1bGwKaGlzdG9yeSBzdGF5cyByZWNvdmVyYWJsZSBmcm9tIGBBdHRlc3RlZGAgZXZlbnRzIHZpYSBhbiBpbmRleGVyLgpSZXR1cm5zIGFuIGVtcHR5IHZlY3RvciB3aGVuIG5vdGhpbmcgaGFzIGJlZW4gYXR0ZXN0ZWQgZm9yIHRoZSB0YXJnZXQuCgojIEFyZ3VtZW50cwoqIGBlbnZgIC0gVGhlIGVudmlyb25tZW50IG9iamVjdAoqIGBwcm9qZWN0X2tleWAgLSBUaGUgcHJvamVjdCBrZXkgaWRlbnRpZmllcgoqIGBjb21taXRfaGFzaGAgLSBUaGUgY29tbWl0IGhhc2ggdGhlIGF0dGVzdGF0aW9ucyByZWxhdGUgdG8KKiBgdGFyZ2V0YCAtIFRoZSBhdHRlc3RhdGlvbiB0YXJnZXQ6IHRoZSBjb21taXQgb3IgYSBzcGVjaWZpYyBldmlkZW5jZSBhcnRpZmFjdAoKIyBSZXR1cm5zCiogYFZlYzx0eXBlczo6QXR0ZXN0YXRpb24+YCAtIFRoZSBzdG9yZWQgYXR0ZXN0YXRpb25zLCBvbGRlc3QtZmlyc3QAAAAQZ2V0X2F0dGVzdGF0aW9ucwAAAAMAAAAAAAAAC3Byb2plY3Rfa2V5AAAAAA4AAAAAAAAAC2NvbW1pdF9oYXNoAAAAABAAAAAAAAAABnRhcmdldAAAAAAH0AAAABFBdHRlc3RhdGlvblRhcmdldAAAAAAAAAEAAAPqAAAH0AAAAAtBdHRlc3RhdGlvbgA=",
        "AAAAAAAAAOdHZXQgc3ViLXByb2plY3RzIGZvciBhIHByb2plY3QgKGlmIGl0J3MgYW4gb3JnYW5pemF0aW9uKS4KCiMgQXJndW1lbnRzCiogYGVudmAgLSBUaGUgZW52aXJvbm1lbnQgb2JqZWN0CiogYHByb2plY3Rfa2V5YCAtIFRoZSBwcm9qZWN0IGtleSBpZGVudGlmaWVyCgojIFJldHVybnMKKiBgVmVjPEJ5dGVzPmAgLSBMaXN0IG9mIHN1Yi1wcm9qZWN0IGtleXMsIGVtcHR5IGlmIG5vdCBhbiBvcmdhbml6YXRpb24AAAAAEGdldF9zdWJfcHJvamVjdHMAAAABAAAAAAAAAAtwcm9qZWN0X2tleQAAAAAOAAAAAQAAA+oAAAAO",
        "AAAAAAAAAn5TZXQgc3ViLXByb2plY3RzIGZvciBhIHByb2plY3QgKG1ha2luZyBpdCBhbiBvcmdhbml6YXRpb24pLgoKTm90ZTogYnkgZGVzaWduLCBzdWItcHJvamVjdCBrZXlzIGFyZSBub3QgdmFsaWRhdGVkIGFnYWluc3QgZXhpc3RpbmcKcHJvamVjdHMuIFRoaXMgYWxsb3dzIHJlc2VydmluZyBhIHByb2plY3Qgc3BhY2UgYmVmb3JlIHRoZSBwcm9qZWN0IGlzCnJlZ2lzdGVyZWQgKHNpbmNlIHRoZSBrZXkgaXMgZGVyaXZlZCBmcm9tIHRoZSBuYW1lKS4gQSBwcm9qZWN0IGNhbgphbHNvIGFwcGVhciBpbiBtdWx0aXBsZSBvcmdhbml6YXRpb25zLgoKIyBBcmd1bWVudHMKKiBgZW52YCAtIFRoZSBlbnZpcm9ubWVudCBvYmplY3QKKiBgbWFpbnRhaW5lcmAgLSBUaGUgbWFpbnRhaW5lciBhZGRyZXNzIGNhbGxpbmcgdGhpcyBmdW5jdGlvbgoqIGBwcm9qZWN0X2tleWAgLSBUaGUgcHJvamVjdCBrZXkgaWRlbnRpZmllcgoqIGBzdWJfcHJvamVjdHNgIC0gTGlzdCBvZiBzdWItcHJvamVjdCBrZXlzIHRvIGFzc29jaWF0ZQoKIyBQYW5pY3MKKiBJZiB0aGUgcHJvamVjdCBkb2Vzbid0IGV4aXN0CiogSWYgdGhlIG1haW50YWluZXIgaXMgbm90IGF1dGhvcml6ZWQKKiBJZiBtb3JlIHRoYW4gMTAgc3ViLXByb2plY3RzIGFyZSBwcm92aWRlZAAAAAAAEHNldF9zdWJfcHJvamVjdHMAAAADAAAAAAAAAAptYWludGFpbmVyAAAAAAATAAAAAAAAAAtwcm9qZWN0X2tleQAAAAAOAAAAAAAAAAxzdWJfcHJvamVjdHMAAAPqAAAADgAAAAA=",
        "AAAAAAAABABSZXZva2UgdGhlIGNhbGxlcidzIG93biBhdHRlc3RhdGlvbiBmcm9tIGEgdGFyZ2V0LgoKT25seSB0aGUgYXR0ZXN0ZXIgY2FuIHJlbW92ZSB0aGVpciB2b3VjaCwgYW5kIG9ubHkgdGhlaXIgb3duOiBhIG1haW50YWluZXIKY2Fubm90IHN0cmlrZSBhbm90aGVyJ3MuIFJldm9jYXRpb24gaXMgYm91bmRlZCB0d2ljZSBvdmVyLCBzbyBhIHZvdWNoIHRoYXQKb3RoZXJzIGhhdmUgYWxyZWFkeSByZWxpZWQgb24gY2Fubm90IGJlIHB1bGxlZCBvdXQgZnJvbSB1bmRlciB0aGVtOgoKMS4gKipOb3Qgb25jZSB0aGUgdGFyZ2V0IGlzIGZpbmFsLioqIEFuIGBhdHRlc3RgIHRoYXQgYnJpbmdzIHRoZSB0YXJnZXQKdG8gaXRzIHRocmVzaG9sZCByZWNvcmRzIGZpbmFsaXR5LCB3aGljaCBpcyBuZXZlciBjbGVhcmVkLiBBIHRhcmdldApjYW4gYWxzbyByZWFkIGFzIGZpbmFsIHdpdGhvdXQgdGhhdCByZWNvcmQgYWZ0ZXIgbWFpbnRhaW5lcnMgYXJlCnJlbW92ZWQ7IGl0IHRoZW4gYmVjb21lcyByZXZvY2FibGUgYWdhaW4gaWYgdGhleSBhcmUgYWRkZWQgYmFjay4KMi4gKipOb3QgYWZ0ZXIgYEFUVEVTVEFUSU9OX1JFVk9DQVRJT05fV0lORE9XYCoqIGhhcyBlbGFwc2VkIHNpbmNlCmBjcmVhdGVkX2F0YC4gUGFzdCB0aGF0IHRoZSB2b3VjaCBpcyBwZXJtYW5lbnQuCgpXaXRoaW4gdGhvc2UgYm91bmRzLCByZXZva2luZyBmcmVlcyB0aGUgc2xvdCBhbmQgdGhlIGNhbGxlciBtYXkgYXR0ZXN0IHRoZQp0YXJnZXQgYWdhaW4gd2l0aCBhIGZyZXNoIGBjcmVhdGVkX2F0YCDigJQgcmV2b2tlIHBsdXMgcmUtYXR0ZXN0IGlzIHRoZQpzdXBwb3J0ZWQgd2F5IHRvIGFtZW5kIGEgYG5vdGVgIG9yIGNvcnJlY3QgYSBtaXN0YWtlbiB2b3VjaC4gVGhlCmBBdHRlc3RlZGAgLyBgQXR0ZXN0YXRpb25SZXZva2VkYCBldmVudCBwYWlyIGlzIHRoZSBkdXJhYmxlIGF1ZGl0IHRyYWlsLgoKIyBBcmd1bWVudHMKKiBgZW52YCAtIFRoZSBlbnZpcm9ubWVudCBvYmplY3QKKiBgYXR0ZXN0ZXJgIC0gVGhlIG1haW50YWluZXIgcmV2b2tpAAAAEnJldm9rZV9hdHRlc3RhdGlvbgAAAAAABAAAAAAAAAAIYXR0ZXN0ZXIAAAATAAAAAAAAAAtwcm9qZWN0X2tleQAAAAAOAAAAAAAAAAtjb21taXRfaGFzaAAAAAAQAAAAAAAAAAZ0YXJnZXQAAAAAB9AAAAARQXR0ZXN0YXRpb25UYXJnZXQAAAAAAAAA",
        "AAAAAAAAAyJDb21wdXRlIHdoZXRoZXIgYW4gYXR0ZXN0YXRpb24gdGFyZ2V0IGlzIGZpbmFsIChjYW5vbmljYWwpLCBvbi1jaGFpbi4KCkEgdGFyZ2V0IGlzIGZpbmFsIG9uY2UgdGhlIHNoYXJlIG9mIHRoZSBwcm9qZWN0J3MgKmN1cnJlbnQqIG1haW50YWluZXJzCnRoYXQgaGF2ZSBhdHRlc3RlZCBpdCByZWFjaGVzIHRoZSBwcm9qZWN0J3MgZmluYWxpdHkgdGhyZXNob2xkLiBUaGUgdGFyZ2V0CmlzIGVpdGhlciB0aGUgY29tbWl0IGl0c2VsZiAoYENvbW1pdGApIG9yIGEgc3BlY2lmaWMgZXZpZGVuY2UgYXJ0aWZhY3QKKGBFdmlkZW5jZShraW5kLCBjaWQpYCkgdGllZCB0byB0aGF0IGNvbW1pdC4gQXR0ZXN0YXRpb25zIGZyb20gYWRkcmVzc2VzCnRoYXQgYXJlIG5vIGxvbmdlciBtYWludGFpbmVycyBhcmUgaWdub3JlZCwgc28gYSByZW1vdmVkIG1haW50YWluZXIncyBzdGFsZQp2b3VjaCBjYW5ub3QgaW5mbGF0ZSB0aGUgY291bnQuCgojIEFyZ3VtZW50cwoqIGBlbnZgIC0gVGhlIGVudmlyb25tZW50IG9iamVjdAoqIGBwcm9qZWN0X2tleWAgLSBUaGUgcHJvamVjdCBrZXkgaWRlbnRpZmllcgoqIGBjb21taXRfaGFzaGAgLSBUaGUgY29tbWl0IGhhc2ggYmVpbmcgZXZhbHVhdGVkCiogYHRhcmdldGAgLSBUaGUgYXR0ZXN0YXRpb24gdGFyZ2V0OiB0aGUgY29tbWl0IG9yIGEgc3BlY2lmaWMgZXZpZGVuY2UgYXJ0aWZhY3QKCiMgUmV0dXJucwoqIGB0eXBlczo6RmluYWxpdHlTdGF0dXNgIC0gYHsgYXR0ZXN0ZWQsIHRvdGFsLCBpc19maW5hbCB9YAoKIyBQYW5pY3MKKiBJZiB0aGUgcHJvamVjdCBkb2Vzbid0IGV4aXN0AAAAAAAYZ2V0X2F0dGVzdGF0aW9uX2ZpbmFsaXR5AAAAAwAAAAAAAAALcHJvamVjdF9rZXkAAAAADgAAAAAAAAALY29tbWl0X2hhc2gAAAAAEAAAAAAAAAAGdGFyZ2V0AAAAAAfQAAAAEUF0dGVzdGF0aW9uVGFyZ2V0AAAAAAAAAQAAB9AAAAAORmluYWxpdHlTdGF0dXMAAA==",
        "AAAAAAAAAVFHZXQgdGhlIGF0dGVzdGF0aW9uIGZpbmFsaXR5IHRocmVzaG9sZCAocGVyY2VudCkgZm9yIGEgcHJvamVjdC4KClJldHVybnMgdGhlIHByb2plY3QncyBzdG9yZWQgdGhyZXNob2xkLCBvciBgREVGQVVMVF9GSU5BTElUWV9USFJFU0hPTERfUEVSQ0VOVGAKd2hlbiB0aGUgcHJvamVjdCBoYXMgbm90IHNldCBvbmUuCgojIEFyZ3VtZW50cwoqIGBlbnZgIC0gVGhlIGVudmlyb25tZW50IG9iamVjdAoqIGBwcm9qZWN0X2tleWAgLSBUaGUgcHJvamVjdCBrZXkgaWRlbnRpZmllcgoKIyBSZXR1cm5zCiogYHUzMmAgLSBUaGUgZmluYWxpdHkgdGhyZXNob2xkIHBlcmNlbnQgZm9yIHRoZSBwcm9qZWN0AAAAAAAAGWdldF9hdHRlc3RhdGlvbl90aHJlc2hvbGQAAAAAAAABAAAAAAAAAAtwcm9qZWN0X2tleQAAAAAOAAAAAQAAAAQ=",
        "AAAAAAAAAzZTZXQgdGhlIGF0dGVzdGF0aW9uIGZpbmFsaXR5IHRocmVzaG9sZCAocGVyY2VudCkgZm9yIGEgcHJvamVjdC4KCkEgY29tbWl0IGlzIGNvbnNpZGVyZWQgZmluYWwgb25jZSB0aGUgc2hhcmUgb2YgY3VycmVudCBtYWludGFpbmVycyB0aGF0CmhhdmUgYXR0ZXN0ZWQgaXQgcmVhY2hlcyB0aGlzIHBlcmNlbnRhZ2UuIEV2ZXJ5IHByb2plY3QgZGVmYXVsdHMgdG8KYERFRkFVTFRfRklOQUxJVFlfVEhSRVNIT0xEX1BFUkNFTlRgIHVudGlsIGl0cyBtYWludGFpbmVycyBzZXQgYSB2YWx1ZSBoZXJlLgpBIGhpZ2hlciB0aHJlc2hvbGQgYXBwbGllcyBhdCBvbmNlOyBhIGxvd2VyIG9uZSBhZnRlciB0aGUgbm90aWNlIHdpbmRvdwpvZiB0aGUgcHJvamVjdCdzIGBtaW5fdm90aW5nX3BlcmlvZCArIGV4ZWN1dGVfZGVsYXlgLgoKIyBBcmd1bWVudHMKKiBgZW52YCAtIFRoZSBlbnZpcm9ubWVudCBvYmplY3QKKiBgbWFpbnRhaW5lcmAgLSBUaGUgYWRkcmVzcyBvZiB0aGUgbWFpbnRhaW5lciBjYWxsaW5nIHRoaXMgZnVuY3Rpb24KKiBgcHJvamVjdF9rZXlgIC0gVGhlIHByb2plY3Qga2V5IGlkZW50aWZpZXIKKiBgcGVyY2VudGAgLSBUaGUgdGhyZXNob2xkIHBlcmNlbnQgKGluIGBNSU5fRklOQUxJVFlfVEhSRVNIT0xEX1BFUkNFTlQuLj0xMDBgKQoKIyBQYW5pY3MKKiBJZiB0aGUgY29udHJhY3QgaXMgcGF1c2VkCiogSWYgdGhlIHByb2plY3QgZG9lc24ndCBleGlzdCBvciB0aGUgbWFpbnRhaW5lciBpcyBub3QgYXV0aG9yaXplZAoqIElmIGBwZXJjZW50YCBpcyBiZWxvdyBgTUlOX0ZJTkFMSVRZX1RIUkVTSE9MRF9QRVJDRU5UYCBvciBhYm92ZSAxMDAAAAAAABlzZXRfYXR0ZXN0YXRpb25fdGhyZXNob2xkAAAAAAAAAwAAAAAAAAAKbWFpbnRhaW5lcgAAAAAAEwAAAAAAAAALcHJvamVjdF9rZXkAAAAADgAAAAAAAAAVYXR0ZXN0YXRpb25fdGhyZXNob2xkAAAAAAAD6AAAAAQAAAAA",
        "AAAAAQAAAAAAAAAAAAAAA0RhbwAAAAABAAAAAAAAAAlwcm9wb3NhbHMAAAAAAAPqAAAH0AAAAAhQcm9wb3NhbA==",
        "AAAAAgAAAAAAAAAAAAAABFZvdGUAAAACAAAAAQAAAAAAAAAKUHVibGljVm90ZQAAAAAAAQAAB9AAAAAKUHVibGljVm90ZQAAAAAAAQAAAAAAAAANQW5vbnltb3VzVm90ZQAAAAAAAAEAAAfQAAAADUFub255bW91c1ZvdGUAAAA=",
        "AAAAAwAAAAAAAAAAAAAABUJhZGdlAAAAAAAABQAAAAAAAAAJRGV2ZWxvcGVyAAAAAJiWgAAAAAAAAAAGVHJpYWdlAAAATEtAAAAAAAAAAAlDb21tdW5pdHkAAAAAD0JAAAAAAAAAAAhWZXJpZmllZAAHoSAAAAAAAAAAB0RlZmF1bHQAAAAAAQ==",
        "AAAAAQAAAAAAAAAAAAAABkJhZGdlcwAAAAAABAAAAAAAAAAJY29tbXVuaXR5AAAAAAAD6gAAABMAAAAAAAAACWRldmVsb3BlcgAAAAAAA+oAAAATAAAAAAAAAAZ0cmlhZ2UAAAAAA+oAAAATAAAAAAAAAAh2ZXJpZmllZAAAA+oAAAAT",
        "AAAAAQAAAAAAAAAAAAAABkNvbmZpZwAAAAAAAgAAAAAAAAAEaXBmcwAAABAAAAAAAAAAA3VybAAAAAAQ",
        "AAAAAQAAAAAAAAAAAAAABk1lbWJlcgAAAAAABAAAAAAAAAAMZ2l0X2lkZW50aXR5AAAD6AAAABAAAAAAAAAACmdpdF9wdWJrZXkAAAAAA+gAAAPuAAAAIAAAAAAAAAAEbWV0YQAAABAAAAAAAAAACHByb2plY3RzAAAD6gAAB9AAAAANUHJvamVjdEJhZGdlcwAAAA==",
        "AAAAAQAAAAAAAAAAAAAAB1Byb2plY3QAAAAABAAAAAAAAAAGY29uZmlnAAAAAAfQAAAABkNvbmZpZwAAAAAAAAAAAAttYWludGFpbmVycwAAAAPqAAAAEwAAAAAAAAAEbmFtZQAAABAAAAAAAAAADHN1Yl9wcm9qZWN0cwAAA+gAAAPqAAAADg==",
        "AAAAAQAAAAAAAAAAAAAACEV2aWRlbmNlAAAAAgAAAAAAAAADY2lkAAAAABAAAAAAAAAACmNyZWF0ZWRfYXQAAAAAAAY=",
        "AAAAAQAAAAAAAAAAAAAACFByb3Bvc2FsAAAABwAAAAAAAAACaWQAAAAAAAQAAAAAAAAABGlwZnMAAAAQAAAAAAAAABFvdXRjb21lX2NvbnRyYWN0cwAAAAAAA+gAAAPqAAAH0AAAAA9PdXRjb21lQ29udHJhY3QAAAAAAAAAAAhwcm9wb3NlcgAAABMAAAAAAAAABnN0YXR1cwAAAAAH0AAAAA5Qcm9wb3NhbFN0YXR1cwAAAAAAAAAAAAV0aXRsZQAAAAAAABAAAAAAAAAACXZvdGVfZGF0YQAAAAAAB9AAAAAIVm90ZURhdGE=",
        "AAAAAQAAAAAAAAAAAAAACFZvdGVEYXRhAAAABAAAAAAAAAANcHVibGljX3ZvdGluZwAAAAAAAAEAAAAAAAAADnRva2VuX2NvbnRyYWN0AAAAAAPoAAAAEwAAAAAAAAAFdm90ZXMAAAAAAAPqAAAH0AAAAARWb3RlAAAAAAAAAA52b3RpbmdfZW5kc19hdAAAAAAABg==",
        "AAAAAQAAAAAAAAAAAAAAClB1YmxpY1ZvdGUAAAAAAAMAAAAAAAAAB2FkZHJlc3MAAAAAEwAAAAAAAAALdm90ZV9jaG9pY2UAAAAH0AAAAApWb3RlQ2hvaWNlAAAAAAAAAAAABndlaWdodAAAAAAABA==",
        "AAAAAgAAAAAAAAAAAAAAClZvdGVDaG9pY2UAAAAAAAMAAAAAAAAAAAAAAAdBcHByb3ZlAAAAAAAAAAAAAAAABlJlamVjdAAAAAAAAAAAAAAAAAAHQWJzdGFpbgA=",
        "AAAAAQAAAAAAAAAAAAAAC0F0dGVzdGF0aW9uAAAAAAQAAAAAAAAACGF0dGVzdGVyAAAAEwAAAAAAAAAKY3JlYXRlZF9hdAAAAAAABgAAAAAAAAAEbm90ZQAAA+gAAAAQAAAAAAAAAAZ3ZWlnaHQAAAAAAAQ=",
        "AAAAAQAAAAAAAAAAAAAAC0NvbnRyYWN0UmVmAAAAAAIAAAAAAAAAB2FkZHJlc3MAAAAAEwAAAAAAAAAJd2FzbV9oYXNoAAAAAAAD6AAAA+4AAAAg",
        "AAAAAQAAAAAAAAAAAAAADEFkbWluc0NvbmZpZwAAAAIAAAAAAAAABmFkbWlucwAAAAAD6gAAABMAAAAAAAAACXRocmVzaG9sZAAAAAAAAAQ=",
        "AAAAAgAAAAAAAAAAAAAADEV2aWRlbmNlS2luZAAAAAMAAAAAAAAAAAAAAARTYm9tAAAAAAAAAAAAAAADQ3ZlAAAAAAAAAAAAAAAAC0F0dGVzdGF0aW9uAA==",
        "AAAAAQAAAAAAAAAAAAAADUFub255bW91c1ZvdGUAAAAAAAAFAAAAAAAAAAdhZGRyZXNzAAAAABMAAAAAAAAAC2NvbW1pdG1lbnRzAAAAA+oAAAPuAAAAYAAAAAAAAAAPZW5jcnlwdGVkX3NlZWRzAAAAA+oAAAAQAAAAAAAAAA9lbmNyeXB0ZWRfdm90ZXMAAAAD6gAAABAAAAAAAAAABndlaWdodAAAAAAABA==",
        "AAAAAQAAAAAAAAAAAAAADVByb2plY3RCYWRnZXMAAAAAAAACAAAAAAAAAAZiYWRnZXMAAAAAA+oAAAfQAAAABUJhZGdlAAAAAAAAAAAAAAdwcm9qZWN0AAAAAA4=",
        "AAAAAQAAAAAAAAAAAAAADkZpbmFsaXR5U3RhdHVzAAAAAAAEAAAAAAAAAAhhdHRlc3RlZAAAAAQAAAAAAAAADGZpbmFsaXplZF9hdAAAA+gAAAAGAAAAAAAAAAhpc19maW5hbAAAAAEAAAAAAAAABXRvdGFsAAAAAAAABA==",
        "AAAAAgAAAAAAAAAAAAAADlByb3Bvc2FsU3RhdHVzAAAAAAAFAAAAAAAAAAAAAAAGQWN0aXZlAAAAAAAAAAAAAAAAAAhBcHByb3ZlZAAAAAAAAAAAAAAACFJlamVjdGVkAAAAAAAAAAAAAAAJQ2FuY2VsbGVkAAAAAAAAAAAAAAAAAAAJTWFsaWNpb3VzAAAA",
        "AAAAAQAAAAAAAAAAAAAAD091dGNvbWVDb250cmFjdAAAAAADAAAAAAAAAAdhZGRyZXNzAAAAABMAAAAAAAAABGFyZ3MAAAPqAAAAAAAAAAAAAAAKZXhlY3V0ZV9mbgAAAAAAEQ==",
        "AAAAAQAAAAAAAAAAAAAAD1VwZ3JhZGVQcm9wb3NhbAAAAAAEAAAAAAAAAA1hZG1pbnNfY29uZmlnAAAAAAAH0AAAAAxBZG1pbnNDb25maWcAAAAAAAAACWFwcHJvdmFscwAAAAAAA+oAAAATAAAAAAAAAA1leGVjdXRhYmxlX2F0AAAAAAAABgAAAAAAAAAJd2FzbV9oYXNoAAAAAAAD7gAAACA=",
        "AAAAAgAAAAAAAAAAAAAAEUF0dGVzdGF0aW9uVGFyZ2V0AAAAAAAAAgAAAAAAAAAAAAAABkNvbW1pdAAAAAAAAQAAAAAAAAAIRXZpZGVuY2UAAAACAAAH0AAAAAxFdmlkZW5jZUtpbmQAAAAQ",
        "AAAAAQAAAAAAAAAAAAAAE0Fub255bW91c1ZvdGVDb25maWcAAAAAAwAAAAAAAAAKcHVibGljX2tleQAAAAAAEAAAAAAAAAAUc2VlZF9nZW5lcmF0b3JfcG9pbnQAAAPuAAAAYAAAAAAAAAAUdm90ZV9nZW5lcmF0b3JfcG9pbnQAAAPuAAAAYA==",
        "AAAABAAAAAAAAAAAAAAADkNvbnRyYWN0RXJyb3JzAAAAAAAuAAAAAAAAAA9VbmV4cGVjdGVkRXJyb3IAAAAAAAAAAAAAAAASVW5hdXRob3JpemVkU2lnbmVyAAAAAABkAAAAAAAAAApXcm9uZ1ZvdGVyAAAAAABlAAAAAAAAABFNaXNzaW5nTWFpbnRhaW5lcgAAAAAAAGcAAAAAAAAACkludmFsaWRLZXkAAAAAAMgAAAAAAAAAE1Byb2plY3RBbHJlYWR5RXhpc3QAAAAAyQAAAAAAAAASVG9vTWFueVN1YlByb2plY3RzAAAAAADKAAAAAAAAABdQcm9wb3NhbElucHV0VmFsaWRhdGlvbgAAAADLAAAAAAAAAA1Vbmtub3duTWVtYmVyAAAAAAAAzAAAAAAAAAASTWVtYmVyQWxyZWFkeUV4aXN0AAAAAADNAAAAAAAAABJJbnZhbGlkUHJvamVjdE5hbWUAAAAAAM4AAAAAAAAADVdyb25nVm90ZVR5cGUAAAAAAADPAAAAAAAAAA1CYWRDb21taXRtZW50AAAAAAAA0AAAAAAAAAALVm90ZXJXZWlnaHQAAAAA0QAAAAAAAAARVm90ZUxpbWl0RXhjZWVkZWQAAAAAAADSAAAAAAAAAA9Wb3RlckNvbmZsaWN0ZWQAAAAA0wAAAAAAAAAPSW52YWxpZEV2aWRlbmNlAAAAANQAAAAAAAAAEUludmFsaWRDb21taXRIYXNoAAAAAAAA1QAAAAAAAAATSW52YWxpZFZvdGluZ1BlcmlvZAAAAADWAAAAAAAAABJJbnZhbGlkQXR0ZXN0YXRpb24AAAAAANcAAAAAAAAAG0ludmFsaWRBdHRlc3RhdGlvblRocmVzaG9sZAAAAADYAAAAAAAAAA9BbHJlYWR5QXR0ZXN0ZWQAAAAA2QAAAAAAAAASVG9vTWFueU1haW50YWluZXJzAAAAAADaAAAAAAAAABNEdXBsaWNhdGVNYWludGFpbmVyAAAAANsAAAAAAAAAE1Rvb01hbnlBdHRlc3RhdGlvbnMAAAAA3AAAAAAAAAATQXR0ZXN0YXRpb25Ob3RGb3VuZAAAAADdAAAAAAAAABRBdHRlc3RhdGlvbkZpbmFsaXplZAAAAN4AAAAAAAAAHEF0dGVzdGF0aW9uUmV2b2NhdGlvbkV4cGlyZWQAAADfAAAAAAAAAA1JbnZhbGlkQmFkZ2VzAAAAAAAA4AAAAAAAAAAUSW52YWxpZFByb2plY3RDb25maWcAAADhAAAAAAAAAAtOb0hhc2hGb3VuZAAAAAEsAAAAAAAAABVOb1Byb3Bvc2Fsb3JQYWdlRm91bmQAAAAAAAEtAAAAAAAAABJOb1Byb2plY3RQYWdlRm91bmQAAAAAAS4AAAAAAAAAF05vQW5vbnltb3VzVm90aW5nQ29uZmlnAAAAAS8AAAAAAAAADEFscmVhZHlWb3RlZAAAAZAAAAAAAAAAElByb3Bvc2FsVm90aW5nVGltZQAAAAABkQAAAAAAAAAOUHJvcG9zYWxBY3RpdmUAAAAAAZIAAAAAAAAADE91dGNvbWVFcnJvcgAAAZMAAAAAAAAADFZvdGVOb3RGb3VuZAAAAZQAAAAAAAAADlRhbGx5U2VlZEVycm9yAAAAAAH0AAAAAAAAAAxJbnZhbGlkUHJvb2YAAAH1AAAAAAAAAA5Db250cmFjdFBhdXNlZAAAAAACWAAAAAAAAAAMVXBncmFkZUVycm9yAAACWQAAAAAAAAASQ29udHJhY3RWYWxpZGF0aW9uAAAAAAJaAAAAAAAAAA9Db2xsYXRlcmFsRXJyb3IAAAACWwAAAAAAAAASSW52YWxpZEdpdElkZW50aXR5AAAAAAK8",
        "AAAABQAAAAAAAAAAAAAABkNvbW1pdAAAAAAAAQAAAAZjb21taXQAAAAAAAIAAAAAAAAAC3Byb2plY3Rfa2V5AAAAAA4AAAABAAAAAAAAAARoYXNoAAAAEAAAAAAAAAAC",
        "AAAABQAAAAAAAAAAAAAACEF0dGVzdGVkAAAAAQAAAAhhdHRlc3RlZAAAAAUAAAAAAAAAC3Byb2plY3Rfa2V5AAAAAA4AAAABAAAAAAAAAAtjb21taXRfaGFzaAAAAAAQAAAAAAAAAAAAAAAGdGFyZ2V0AAAAAAfQAAAAEUF0dGVzdGF0aW9uVGFyZ2V0AAAAAAAAAAAAAAAAAAAIYXR0ZXN0ZXIAAAATAAAAAAAAAAAAAAAGd2VpZ2h0AAAAAAAEAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAACFZvdGVDYXN0AAAAAQAAAAl2b3RlX2Nhc3QAAAAAAAADAAAAAAAAAAtwcm9qZWN0X2tleQAAAAAOAAAAAQAAAAAAAAALcHJvcG9zYWxfaWQAAAAABAAAAAAAAAAAAAAABXZvdGVyAAAAAAAAEwAAAAAAAAAC",
        "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",
      ]),
      options,
    );
  }
  public readonly fromJSON = {
    vote: this.txFromJSON<null>,
    proof: this.txFromJSON<boolean>,
    execute: this.txFromJSON<ProposalStatus>,
    get_dao: this.txFromJSON<Dao>,
    remove_vote: this.txFromJSON<null>,
    get_proposal: this.txFromJSON<Proposal>,
    create_proposal: this.txFromJSON<u32>,
    revoke_proposal: this.txFromJSON<null>,
    anonymous_voting_setup: this.txFromJSON<null>,
    add_conflict_of_interest: this.txFromJSON<null>,
    get_conflict_of_interest: this.txFromJSON<Array<string>>,
    get_anonymous_voting_config: this.txFromJSON<AnonymousVoteConfig>,
    remove_conflict_of_interest: this.txFromJSON<null>,
    build_commitments_from_votes: this.txFromJSON<Array<Buffer>>,
    pause: this.txFromJSON<null>,
    version: this.txFromJSON<u32>,
    set_executor: this.txFromJSON<null>,
    approve_upgrade: this.txFromJSON<null>,
    propose_upgrade: this.txFromJSON<null>,
    finalize_upgrade: this.txFromJSON<null>,
    get_admins_config: this.txFromJSON<AdminsConfig>,
    require_not_paused: this.txFromJSON<null>,
    get_upgrade_proposal: this.txFromJSON<UpgradeProposal>,
    add_member: this.txFromJSON<null>,
    get_badges: this.txFromJSON<Badges>,
    get_member: this.txFromJSON<Member>,
    set_badges: this.txFromJSON<null>,
    update_member: this.txFromJSON<null>,
    get_max_weight: this.txFromJSON<u32>,
    get_nqg_contract: this.txFromJSON<Option<ContractRef>>,
    set_nqg_contract: this.txFromJSON<null>,
    attest: this.txFromJSON<null>,
    commit: this.txFromJSON<null>,
    register: this.txFromJSON<Buffer>,
    get_commit: this.txFromJSON<string>,
    get_project: this.txFromJSON<Project>,
    get_evidence: this.txFromJSON<Array<Evidence>>,
    get_projects: this.txFromJSON<Array<Project>>,
    set_evidence: this.txFromJSON<null>,
    update_config: this.txFromJSON<null>,
    get_attestations: this.txFromJSON<Array<Attestation>>,
    get_sub_projects: this.txFromJSON<Array<Buffer>>,
    set_sub_projects: this.txFromJSON<null>,
    revoke_attestation: this.txFromJSON<null>,
    get_attestation_finality: this.txFromJSON<FinalityStatus>,
    get_attestation_threshold: this.txFromJSON<u32>,
    set_attestation_threshold: this.txFromJSON<null>,
  };
}
