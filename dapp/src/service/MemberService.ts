/** Members: their profiles and voting weight, joining and editing. */
import { queryOptions } from "@tanstack/react-query";
import { Buffer } from "buffer";
import { tansuFor, tansuReads } from "../contracts/soroban_tansu";
import { readResult } from "../utils/contractErrors";
import { fetchWithin } from "../utils/deadline";
import { fetchFromIpfs } from "../utils/ipfsFunctions";
import { IpfsMissError } from "../utils/ipfsMissCache";
import { parseEd25519SshKey } from "../utils/sshSignature";
import { deriveProjectKey, projectKeyHex } from "../utils/projectKey";
import { queryClient } from "./queryClient";
import { packUpload, sendTransaction } from "./TxService";
import { connectedAddress } from "./walletService";

const MINUTE = 60_000;

/** A member's profile.json. */
export interface ProfileData {
  name: string;
  description: string;
  social: string;
  /** The picture's file in the same directory. */
  image?: string;
}

/** A file name within the directory: no path, nothing hidden. */
const isFileName = (value: unknown): value is string =>
  typeof value === "string" && /^[\w-][\w.-]*$/.test(value);

/** profile.json's fields, as strings; `null` without a usable file. */
export function parseProfile(json: string | null): ProfileData | null {
  let data: any;
  try {
    data = json ? JSON.parse(json) : null;
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const str = (value: unknown) => (typeof value === "string" ? value : "");
  return {
    name: str(data.name),
    description: str(data.description),
    social: str(data.social),
    ...(isFileName(data.image) && { image: data.image }),
  };
}

/** Where pictures were stored before profile.json named them. */
const PICTURE_FILES = [
  "profile-image.png",
  "profile-image.jpeg",
  "profile-image.jpg",
];

/**
 * The file of a member's profile picture in their directory `cid`; `null`
 * for none. `named` is the one profile.json gives.
 */
export const profilePictureQuery = (cid: string, named?: string) =>
  queryOptions({
    queryKey: ["profilePicture", cid, named ?? ""],
    queryFn: async () => {
      for (const file of named ? [named] : PICTURE_FILES) {
        try {
          await fetchFromIpfs(cid, file);
          return file;
        } catch (error) {
          if (!(error instanceof IpfsMissError && error.scope === "path")) {
            throw error;
          }
        }
      }
      return null;
    },
    staleTime: Infinity,
  });

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

/** An Ed25519 SSH key of a Git account. */
export interface GitKey {
  /** The key as the host lists it: `ssh-ed25519 AAAA… comment`. */
  line: string;
  raw: Uint8Array;
}

/** The hosts whose accounts list their SSH keys publicly. */
const KEY_LISTS: Record<string, (user: string) => string> = {
  github: (user) => `https://api.github.com/users/${user}/keys`,
  gitlab: (user) => `https://gitlab.com/api/v4/users/${user}/keys`,
};

/** Whether the keys of `provider`'s accounts can be read: GitHub, GitLab. */
const listsGitKeys = (provider: string) => provider in KEY_LISTS;

/** The Ed25519 SSH keys a GitHub or GitLab account lists. */
export async function fetchGitKeys(
  provider: string,
  username: string,
): Promise<GitKey[]> {
  const url = KEY_LISTS[provider]?.(encodeURIComponent(username));
  if (!url) throw new Error(`${provider} does not list its users' keys`);
  const response = await fetchWithin(url);
  if (!response.ok) {
    throw new Error(
      `Could not read ${username}'s keys on ${provider} (HTTP ${response.status})`,
    );
  }
  const listed: unknown = await response.json();
  return (Array.isArray(listed) ? listed : []).flatMap((entry) => {
    const line = typeof entry?.key === "string" ? entry.key : "";
    const raw = parseEd25519SshKey(line);
    return raw ? [{ line, raw }] : [];
  });
}

/**
 * Whether a member's Git key is one their account lists now: `null` for a
 * host that lists none, where the identity is only self-declared.
 */
export const gitKeyListedQuery = (identity: string, pubkey: Uint8Array) => {
  const [provider = "", username = ""] = identity.split(":");
  const hex = Buffer.from(pubkey).toString("hex");
  return queryOptions({
    queryKey: ["gitKeyListed", identity, hex],
    queryFn: async () =>
      listsGitKeys(provider)
        ? (await fetchGitKeys(provider, username)).some(
            (key) => Buffer.from(key.raw).toString("hex") === hex,
          )
        : null,
    staleTime: 60 * MINUTE,
  });
};

/**
 * Pack a profile: like its profile.json, its picture is found at once, without
 * asking a gateway that may not serve it yet.
 */
async function packProfile(files: File[]) {
  if (!files.length) return undefined;
  const upload = await packUpload(files);
  const picture = files.find((file) => file.name !== "profile.json")?.name;
  queryClient.setQueryData(
    profilePictureQuery(upload.cid, picture).queryKey,
    picture ?? null,
  );
  return upload;
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
  const upload = await packProfile(profileFiles);
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
  const upload = await packProfile(profileFiles);
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
