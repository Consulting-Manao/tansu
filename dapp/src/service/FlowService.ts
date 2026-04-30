import { packFilesToCar, uploadToIpfsProxy } from "../utils/ipfsFunctions";
import type { OutcomeContract } from "../types/proposal";

//
import Tansu from "../contracts/soroban_tansu";
import { connectedPublicKey } from "../utils/store";
import { loadedProjectId } from "./StateService";
import { deriveProjectKey } from "../utils/projectKey";
//

//
import { sendSignedTransaction, signAssembledTransaction } from "./TxService";
import { checkSimulationError } from "../utils/contractErrors";
import { Buffer } from "buffer";

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
}

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
): Promise<string> {
  const publicKey = connectedPublicKey.get();
  if (!publicKey) throw new Error("Please connect your wallet first");

  Tansu.options.publicKey = publicKey;
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
 * Create and sign an add member transaction
 */
async function createSignedAddMemberTransaction(
  memberAddress: string,
  meta: string,
): Promise<string> {
  const address = memberAddress || connectedPublicKey.get();
  if (!address) throw new Error("Please connect your wallet first");

  // Validate meta parameter - ensure it's not just whitespace
  if (meta.trim() === "") {
    meta = ""; // Use empty string instead of whitespace
  }

  Tansu.options.publicKey = address;

  const tx = await Tansu.add_member({
    member_address: address,
    meta: meta,
  });

  // Check for simulation errors (contract errors) before signing
  checkSimulationError(tx as any);

  return await signAssembledTransaction(tx);
}

/**
 * Send a signed transaction to the network
 */
async function sendSignedTransactionLocal(signedTxXdr: string): Promise<any> {
  return sendSignedTransaction(signedTxXdr);
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
  const signedTxXdr = await createSignedProposalTransaction(
    projectName,
    proposalName,
    cid,
    votingEndsAt,
    publicVoting,
    outcomeContracts,
    tokenContract,
  );

  // Step 3: Upload the pre-calculated CAR to IPFS using the Proxy
  onProgress?.(8); // Uploading to IPFS (UI index 3)
  const uploadedCid = await uploadToIpfsProxy({
    cid,
    carBlob,
    signedTxXdr,
  });

  // Step 4: Verify CID matches
  if (uploadedCid !== cid) {
    throw new Error(
      `Critical CID mismatch: expected ${cid}, got ${uploadedCid}`,
    );
  }

  // Step 5: Send the signed transaction
  onProgress?.(9); // Sending transaction
  const result = await sendSignedTransactionLocal(signedTxXdr);

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
  const signedTxXdr = await createSignedAddMemberTransaction(
    memberAddress,
    cid,
  );

  if (profileFiles.length > 0 && carBlob) {
    // Step 3: Upload the pre-calculated CAR to IPFS using the Proxy
    onProgress?.(8);
    const uploadedCid = await uploadToIpfsProxy({
      cid,
      carBlob,
      signedTxXdr,
    });

    // Step 4: Verify CID matches
    if (uploadedCid !== cid) {
      throw new Error(
        `Critical CID mismatch: expected ${cid}, got ${uploadedCid}`,
      );
    }
  }

  // Step 5: Send the signed transaction
  onProgress?.(9);
  await sendSignedTransactionLocal(signedTxXdr);
  return true;
}

/**
 * Create and sign an update member transaction
 */
async function createSignedUpdateMemberTransaction(
  memberAddress: string,
  meta: string,
): Promise<string> {
  const address = memberAddress || connectedPublicKey.get();
  if (!address) throw new Error("Please connect your wallet first");

  Tansu.options.publicKey = address;

  const tx = await Tansu.update_member({
    member_address: address,
    meta: meta,
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
  const signedTxXdr = await createSignedUpdateMemberTransaction(
    memberAddress,
    cid,
  );

  if (profileFiles.length > 0 && carBlob) {
    onProgress?.(8);
    const uploadedCid = await uploadToIpfsProxy({
      cid,
      carBlob,
      signedTxXdr,
    });

    if (uploadedCid !== cid) {
      throw new Error(
        `Critical CID mismatch: expected ${cid}, got ${uploadedCid}`,
      );
    }
  }

  onProgress?.(9);
  await sendSignedTransactionLocal(signedTxXdr);
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
}: CreateProjectFlowParams): Promise<boolean> {
  // Step 1 – Calculate CID and pack CAR once
  const filesToUpload = [tomlFile, ...(additionalFiles || [])];
  const { cid, carBlob } = await packFilesToCar(filesToUpload);

  // Step 2 – Create & sign register transaction
  onProgress?.(7);

  const publicKey = connectedPublicKey.get();
  if (!publicKey) throw new Error("Please connect your wallet first");

  Tansu.options.publicKey = publicKey;

  const tx = await Tansu.register({
    maintainer: publicKey,
    name: projectName,
    maintainers,
    url: githubRepoUrl,
    ipfs: cid,
  });

  // Check for simulation errors (contract errors) before signing
  checkSimulationError(tx as any);

  const signedTxXdr = await signAssembledTransaction(tx);

  // Step 3 – Upload the pre-calculated CAR to IPFS using the Proxy
  onProgress?.(8);
  const uploadedCid = await uploadToIpfsProxy({
    cid,
    carBlob,
    signedTxXdr,
  });

  // Step 4 – Verify CID matches
  if (uploadedCid !== cid) {
    throw new Error(
      `Critical CID mismatch: expected ${cid}, got ${uploadedCid}`,
    );
  }

  // Step 5 – Send signed transaction
  onProgress?.(9);
  await sendSignedTransactionLocal(signedTxXdr);

  return true;
}

/** Create and sign an update_config transaction */
async function createSignedUpdateConfigTransaction(
  maintainers: string[],
  configUrl: string,
  cid: string,
): Promise<string> {
  const publicKey = connectedPublicKey.get();
  if (!publicKey) throw new Error("Please connect your wallet first");

  Tansu.options.publicKey = publicKey;

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
}: {
  tomlFile: File;
  githubRepoUrl: string;
  maintainers: string[];
  onProgress?: (step: number) => void;
  additionalFiles?: File[];
}): Promise<boolean> {
  // Step 1 – Calculate CID and pack CAR once
  const filesToUpload = [tomlFile, ...(additionalFiles || [])];
  const { cid, carBlob } = await packFilesToCar(filesToUpload);

  // Step 2 – sign tx
  onProgress?.(7);
  const signedTxXdr = await createSignedUpdateConfigTransaction(
    maintainers,
    githubRepoUrl,
    cid,
  );

  // Step 3 – upload
  onProgress?.(8);
  const uploadedCid = await uploadToIpfsProxy({
    cid,
    carBlob,
    signedTxXdr,
  });

  if (uploadedCid !== cid) {
    throw new Error(
      `Critical CID mismatch: expected ${cid}, got ${uploadedCid}`,
    );
  }

  onProgress?.(9);
  await sendSignedTransaction(signedTxXdr);
  return true;
}

/**
 * Remove a malicious vote from a proposal.
 * Only callable by a project maintainer. The voter's collateral is slashed.
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

  Tansu.options.publicKey = maintainer;

  const tx = await Tansu.remove_vote({
    maintainer,
    project_key: projectKey,
    proposal_id: proposalId,
    voter: voterAddress,
  });

  checkSimulationError(tx as any);

  const signedTxXdr = await signAssembledTransaction(tx);
  await sendSignedTransactionLocal(signedTxXdr);
}
