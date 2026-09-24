/** Members: their profiles and voting weight, joining and editing. */
import { queryOptions } from "@tanstack/react-query";
import type { Buffer } from "buffer";
import { tansuFor, tansuReads } from "../contracts/soroban_tansu";
import { readResult } from "../utils/contractErrors";
import { deriveProjectKey, projectKeyHex } from "../utils/projectKey";
import { packUpload, sendTransaction } from "./TxService";
import { connectedAddress } from "./walletService";

const MINUTE = 60_000;

/** A member by address; `null` when the address never joined. */
export const memberQuery = (address: string) =>
  queryOptions({
    queryKey: ["member", address],
    queryFn: async () =>
      readResult(await tansuReads.get_member({ member_address: address }), 204),
    staleTime: 10 * MINUTE,
  });

/**
 * A member's weight in a project, from their badges (or NQG): what they vote
 * with, unless the proposal is token weighted.
 */
export const votingPowerQuery = (name: string, address: string) =>
  queryOptions({
    queryKey: ["votingPower", projectKeyHex(name), address],
    queryFn: async () =>
      readResult(
        await tansuReads.get_max_weight({
          project_key: deriveProjectKey(name),
          member_address: address,
        }),
      ),
    staleTime: MINUTE,
  });

interface ProfileWrite {
  /** The member; the connected wallet when empty. */
  memberAddress: string;
  /** profile.json and its image; none keeps no profile. */
  profileFiles: File[];
  onProgress?: (step: number) => void;
}

/** A Git handle, bound by an SSH signature over the member's address. */
interface GitIdentity {
  gitIdentity: string;
  gitPubkey: Buffer;
  gitSig: Buffer;
}

/** Become a member, with a profile and optionally a Git identity. */
export async function joinCommunity({
  memberAddress,
  profileFiles,
  gitIdentity,
  onProgress,
}: ProfileWrite & { gitIdentity?: GitIdentity | undefined }): Promise<void> {
  const upload = profileFiles.length
    ? await packUpload(profileFiles)
    : undefined;
  onProgress?.(7);
  const address = memberAddress || connectedAddress();
  const tx = await tansuFor(address).add_member({
    member_address: address,
    meta: upload?.cid ?? "",
    git_identity: gitIdentity?.gitIdentity,
    git_pubkey: gitIdentity?.gitPubkey,
    git_sig: gitIdentity?.gitSig,
  });
  await sendTransaction(tx, {
    upload,
    onProgress,
    invalidate: [["member", address]],
  });
}

/** Replace a member's profile. */
export async function updateMember({
  memberAddress,
  profileFiles,
  onProgress,
}: ProfileWrite): Promise<void> {
  const upload = profileFiles.length
    ? await packUpload(profileFiles)
    : undefined;
  onProgress?.(7);
  const address = memberAddress || connectedAddress();
  const tx = await tansuFor(address).update_member({
    member_address: address,
    meta: upload?.cid ?? "",
    git_identity: undefined,
    git_pubkey: undefined,
    git_sig: undefined,
  });
  await sendTransaction(tx, {
    upload,
    onProgress,
    invalidate: [["member", address]],
  });
}
