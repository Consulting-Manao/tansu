import { packFilesToCar, uploadToIpfsProxy } from "../utils/ipfsFunctions";
import type { OutcomeContract } from "../types/proposal";

//
import Tansu from "../contracts/soroban_tansu";
import { connectedPublicKey } from "../utils/store";
import { loadedProjectId } from "./StateService";
import { deriveProjectKey } from "../utils/projectKey";
import { normalizeRepositoryUrl } from "../utils/editLinkFunctions";
//

//
import {
  sendSignedTransaction,
  signAssembledTransaction,
  type SignedTransaction,
} from "./TxService";
import { txSourceFor } from "./walletService";
import { checkSimulationError } from "../utils/contractErrors";
import { Buffer } from "buffer";
import { invalidateQuery } from "./cache/cacheStore";
import { queryKeys } from "./cache/cacheKeys";

interface CreateProposalFlowParams {
  projectName: string;
  proposalName: string;
  proposalFiles: File[];
  votingEndsAt: number;
  publicVoting?: boolean;
  outcomeContracts?: OutcomeContract[]; // New parameter for contract outcomes
  tokenContract?: string;
  onProgress?: (step: number) => void;
}

interface JoinCommunityFlowParams {
  memberAddress: string;
  profileFiles: File[];
  onProgress?: (step: number) => void;
  gitIdentity?: {
    gitIdentity: string;
    gitPubkey: Buffer;
    gitSig: Buffer;
  };
}

interface UpdateMemberFlowParams {
  memberAddress: string;
  profileFiles: File[];
  onProgress?: (step: number) => void;
}

interface CreateProjectFlowParams {
  projectName: string;
  tomlFile: File;
  githubRepoUrl: string;
  maintainers: string[];
  onProgress?: (step: number) => void;
  additionalFiles?: File[]; // Optional files like README.md for non-software projects
  // Per-project governance overrides (added when the contract made the DAO
  // voting period / execute timelock configurable). `undefined` => contract
  // defaults. A short minVotingPeriod is handy for demoing governance.
  minVotingPeriod?: bigint;
  executeDelay?: bigint;
  // Finality threshold percent; `undefined` => contract default.
  attestationThreshold?: number;
}

// Note: stellarSpecPatches removed - SDK v17 handles scSpecTypeVal correctly.

/**
 * Create and sign a proposal transaction
 */
async function createSignedProposalTransaction(
  projectName: string,
  title: string,
  ipfs: string,
  votingEndsAt: number,
  publicVoting: boolean,
  outcomeContracts?: OutcomeContract[],
  tokenContract?: string,
): Promise<SignedTransaction> {
  const publicKey = connectedPublicKey.get();
  if (!publicKey) throw new Error("Please connect your wallet first");

  Tansu.options.publicKey = txSourceFor(publicKey);
  const project_key = deriveProjectKey(projectName);

  const tx = await Tansu.create_proposal({
    proposer: publicKey,
    project_key: project_key,
    title: title,
    ipfs: ipfs,
    voting_ends_at: BigInt(votingEndsAt),
    public_voting: publicVoting,
    outcome_contracts: outcomeContracts || undefined,
    token_contract: tokenContract,
  });

  // Check for simulation errors (contract errors) before signing
  checkSimulationError(tx as any);

  return await signAssembledTransaction(tx);
}

/**
 * Create and sign an add member transaction, optionally with Git identity binding.
 */
async function createSignedAddMemberTransaction(
  memberAddress: string,
  meta: string,
  gitIdentity?: {
    gitIdentity: string;
    gitPubkey: Buffer;
    gitSig: Buffer;
  },
): Promise<SignedTransaction> {
  const address = memberAddress || connectedPublicKey.get();
  if (!address) throw new Error("Please connect your wallet first");

  // Validate meta parameter - ensure it's not just whitespace
  if (meta.trim() === "") {
    meta = ""; // Use empty string instead of whitespace
  }

  Tansu.options.publicKey = txSourceFor(address);

  const tx = await Tansu.add_member({
    member_address: address,
    meta: meta,
    git_identity: gitIdentity?.gitIdentity ?? undefined,
    git_pubkey: gitIdentity?.gitPubkey ?? undefined,
    git_sig: gitIdentity?.gitSig ?? undefined,
  });

  // Check for simulation errors (contract errors) before signing
  checkSimulationError(tx as any);

  return await signAssembledTransaction(tx);
}

/**
 * Upload a CAR to IPFS and land its transaction, in the order the wallet
 * allows. A signed envelope authorizes the upload and is sent after it. A
 * transaction the wallet already submitted (Nido relays smart-account
 * transactions) is confirmed first, and its hash authorizes the upload.
 * `uploadToIpfsProxy` checks that the uploaded CID is the expected one.
 */
export async function uploadAndSend(
  signed: SignedTransaction,
  upload?: { cid: string; carBlob: Blob },
  onProgress?: (step: number) => void,
): Promise<any> {
  if (!upload) {
    onProgress?.(9);
    return sendSignedTransaction(signed);
  }

  if ("hash" in signed) {
    const result = await sendSignedTransaction(signed);
    onProgress?.(8);
    try {
      await uploadToIpfsProxy({ ...upload, txHash: signed.hash });
    } catch (error: any) {
      throw new Error(
        `Transaction ${signed.hash} is on-chain but its IPFS upload failed: ${error?.message ?? error}`,
        { cause: error },
      );
    }
    onProgress?.(9);
    return result;
  }

  onProgress?.(8);
  await uploadToIpfsProxy({ ...upload, signedTxXdr: signed.xdr });
  onProgress?.(9);
  return sendSignedTransaction(signed);
}

/**
 * Execute the new Flow 2 for creating a proposal
 *
 * This flow reduces user interactions from 2 signatures to 1:
 * 1. Calculate CID locally before any user interaction
 * 2. Create and sign the proposal transaction with the pre-calculated CID
 * 3. Upload to IPFS using the signed transaction for authentication
 * 4. Verify the uploaded CID matches the calculated one
 * 5. Send the pre-signed transaction to the network
 *
 * @param params - The proposal creation parameters
 * @returns The created proposal ID
 * @throws Error if any step fails
 */
export async function createProposalFlow({
  projectName,
  proposalName,
  proposalFiles,
  votingEndsAt,
  publicVoting = true,
  outcomeContracts,
  tokenContract,
  onProgress,
}: CreateProposalFlowParams): Promise<number> {
  // Step 1: Calculate CID and pack CAR once
  const { cid, carBlob } = await packFilesToCar(proposalFiles);

  // Step 2: Create and sign the smart contract transaction with the pre-calculated CID
  onProgress?.(7); // Signing proposal transaction (UI index 2)
  const signed = await createSignedProposalTransaction(
    projectName,
    proposalName,
    cid,
    votingEndsAt,
    publicVoting,
    outcomeContracts,
    tokenContract,
  );

  // Steps 3-5: Upload the CAR to IPFS (UI index 3) and send the transaction
  const result = await uploadAndSend(signed, { cid, carBlob }, onProgress);
  invalidateQuery(queryKeys.proposals.all(projectName));
  invalidateQuery(queryKeys.proposals.pages(projectName));

  // The result should be the proposal ID
  if (typeof result === "number") return result;
  const parsed = Number(result);
  if (!Number.isNaN(parsed)) return parsed;
  throw new Error("Unexpected contract response: missing proposal id");
}

/**
 * Execute the new Flow 2 for joining the community
 */
export async function joinCommunityFlow({
  memberAddress,
  profileFiles,
  onProgress,
  gitIdentity,
}: JoinCommunityFlowParams): Promise<boolean> {
  let cid = "";
  let carBlob: Blob | undefined;

  if (profileFiles.length > 0) {
    // Step 1: Calculate CID and pack CAR once
    const result = await packFilesToCar(profileFiles);
    cid = result.cid;
    carBlob = result.carBlob;
  }

  // Step 2: Create and sign the smart contract transaction with the CID
  onProgress?.(7);
  const signed = await createSignedAddMemberTransaction(
    memberAddress,
    cid,
    gitIdentity,
  );

  // Steps 3-5: Upload the profile CAR, if any, and send the transaction
  await uploadAndSend(
    signed,
    profileFiles.length > 0 && carBlob ? { cid, carBlob } : undefined,
    onProgress,
  );
  invalidateQuery(queryKeys.membership.detail(memberAddress));
  return true;
}

/**
 * Create and sign an update member transaction
 */
async function createSignedUpdateMemberTransaction(
  memberAddress: string,
  meta: string,
): Promise<SignedTransaction> {
  const address = memberAddress || connectedPublicKey.get();
  if (!address) throw new Error("Please connect your wallet first");

  Tansu.options.publicKey = txSourceFor(address);

  const tx = await Tansu.update_member({
    member_address: address,
    meta: meta,
    git_identity: undefined,
    git_pubkey: undefined,
    git_sig: undefined,
  });

  checkSimulationError(tx as any);

  return await signAssembledTransaction(tx);
}

/**
 * Execute the flow for updating member profile – mirrors joinCommunityFlow:
 * 1. If profile data is provided, calculate CID locally
 * 2. Create and sign the update_member transaction with the CID
 * 3. If profile data exists, upload to IPFS and verify CID
 * 4. Send the pre-signed transaction to the network
 */
export async function updateMemberFlow({
  memberAddress,
  profileFiles,
  onProgress,
}: UpdateMemberFlowParams): Promise<boolean> {
  let cid = "";
  let carBlob: Blob | undefined;

  if (profileFiles.length > 0) {
    const result = await packFilesToCar(profileFiles);
    cid = result.cid;
    carBlob = result.carBlob;
  }

  onProgress?.(7);
  const signed = await createSignedUpdateMemberTransaction(memberAddress, cid);

  await uploadAndSend(
    signed,
    profileFiles.length > 0 && carBlob ? { cid, carBlob } : undefined,
    onProgress,
  );
  invalidateQuery(queryKeys.membership.detail(memberAddress));
  return true;
}

/**
 * Execute Flow 2 for creating a project
 */
export async function createProjectFlow({
  projectName,
  tomlFile,
  githubRepoUrl,
  maintainers,
  onProgress,
  additionalFiles,
  minVotingPeriod,
  executeDelay,
  attestationThreshold,
}: CreateProjectFlowParams): Promise<boolean> {
  // Step 1 – Calculate CID and pack CAR once
  const filesToUpload = [tomlFile, ...(additionalFiles || [])];
  const { cid, carBlob } = await packFilesToCar(filesToUpload);

  // Step 2 – Create & sign register transaction
  onProgress?.(7);

  const publicKey = connectedPublicKey.get();
  if (!publicKey) throw new Error("Please connect your wallet first");

  Tansu.options.publicKey = txSourceFor(publicKey);
  const normalizedRepositoryUrl =
    normalizeRepositoryUrl(githubRepoUrl) ?? githubRepoUrl;

  const tx = await Tansu.register({
    maintainer: publicKey,
    name: projectName,
    maintainers,
    url: normalizedRepositoryUrl,
    ipfs: cid,
    min_voting_period: minVotingPeriod,
    execute_delay: executeDelay,
    // The contract applies DEFAULT_FINALITY_THRESHOLD_PERCENT when omitted.
    attestation_threshold: attestationThreshold,
  });

  // Check for simulation errors (contract errors) before signing
  checkSimulationError(tx as any);

  const signed = await signAssembledTransaction(tx);

  // Steps 3-5 – Upload the CAR to IPFS and send the transaction
  await uploadAndSend(signed, { cid, carBlob }, onProgress);
  invalidateQuery(queryKeys.projects.all);
  invalidateQuery(
    queryKeys.project.byId(deriveProjectKey(projectName).toString("hex")),
  );

  return true;
}

/** Create and sign an update_config transaction */
async function createSignedUpdateConfigTransaction(
  maintainers: string[],
  configUrl: string,
  cid: string,
  minVotingPeriod?: bigint,
  executeDelay?: bigint,
  attestationThreshold?: number,
): Promise<SignedTransaction> {
  const publicKey = connectedPublicKey.get();
  if (!publicKey) throw new Error("Please connect your wallet first");

  Tansu.options.publicKey = txSourceFor(publicKey);

  const projectId = loadedProjectId();
  if (!projectId) throw new Error("No project defined");

  // Ensure projectId is a proper Buffer
  const projectKey = Buffer.isBuffer(projectId)
    ? projectId
    : Buffer.from(projectId, "hex");

  const tx = await Tansu.update_config({
    maintainer: publicKey,
    key: projectKey,
    maintainers: maintainers,
    url: configUrl,
    ipfs: cid,
    min_voting_period: minVotingPeriod,
    execute_delay: executeDelay,
    attestation_threshold: attestationThreshold,
  });

  // Check for simulation errors (contract errors) before signing
  checkSimulationError(tx as any);

  return await signAssembledTransaction(tx);
}

export async function updateConfigFlow({
  tomlFile,
  githubRepoUrl,
  maintainers,
  onProgress,
  additionalFiles,
  minVotingPeriod,
  executeDelay,
  attestationThreshold,
}: {
  tomlFile: File;
  githubRepoUrl: string;
  maintainers: string[];
  onProgress?: (step: number) => void;
  additionalFiles?: File[];
  // Governance overrides; `undefined` leaves the current on-chain values
  // untouched (contract-side semantics — not "reset to default").
  minVotingPeriod?: bigint;
  executeDelay?: bigint;
  attestationThreshold?: number;
}): Promise<boolean> {
  // Step 1 – Calculate CID and pack CAR once
  const filesToUpload = [tomlFile, ...(additionalFiles || [])];
  const { cid, carBlob } = await packFilesToCar(filesToUpload);

  // Step 2 – sign tx
  onProgress?.(7);
  const normalizedRepositoryUrl =
    normalizeRepositoryUrl(githubRepoUrl) ?? githubRepoUrl;
  const signed = await createSignedUpdateConfigTransaction(
    maintainers,
    normalizedRepositoryUrl,
    cid,
    minVotingPeriod,
    executeDelay,
    attestationThreshold,
  );

  // Step 3 – upload and send
  await uploadAndSend(signed, { cid, carBlob }, onProgress);
  const projectId = loadedProjectId();
  if (projectId) {
    const projectKey = Buffer.isBuffer(projectId)
      ? projectId
      : Buffer.from(projectId, "hex");
    invalidateQuery(queryKeys.project.byId(projectKey.toString("hex")));
  }
  return true;
}

/**
 * Remove a malicious vote from a proposal.
 * Only callable by a project maintainer.
 */
export async function removeVoteFlow({
  projectName,
  proposalId,
  voterAddress,
}: {
  projectName: string;
  proposalId: number;
  voterAddress: string;
}): Promise<void> {
  const maintainer = connectedPublicKey.get();
  if (!maintainer) throw new Error("Please connect your wallet first");

  const projectKey = deriveProjectKey(projectName);

  Tansu.options.publicKey = txSourceFor(maintainer);

  const tx = await Tansu.remove_vote({
    maintainer,
    project_key: projectKey,
    proposal_id: proposalId,
    voter: voterAddress,
  });

  checkSimulationError(tx as any);

  const signed = await signAssembledTransaction(tx);
  await sendSignedTransaction(signed);
  invalidateQuery(queryKeys.proposal.raw(projectName, proposalId));
  invalidateQuery(queryKeys.proposal.detail(projectName, proposalId));
  invalidateQuery(queryKeys.proposals.all(projectName));
  invalidateQuery(queryKeys.proposals.pages(projectName));
}
