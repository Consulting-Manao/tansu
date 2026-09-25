/**
 * Anonymous votes, as a maintainer reveals them with the project's key: each
 * ballot decrypted and checked, and the valid ones summed into the tallies
 * and seeds `execute` proves against the commitments on chain.
 */
import { Buffer } from "buffer";
import type { AnonymousVote } from "../../packages/tansu";
import { tansuReads } from "../contracts/soroban_tansu";
import type { VoteStatus } from "types/proposal";
import { VoteType } from "types/proposal";
import { readResult } from "./contractErrors";
import { decryptWithPrivateKey } from "./crypto";
import { deriveProjectKey } from "./projectKey";

/**
 * The widest seeds the contract's u128 sums allow: 40 votes, each seed
 * multiplied by a u32 weight, stay below 2^128.
 */
const SEED_BITS = 90;

/** A random seed of `SEED_BITS` bits, to blind one value of a ballot. */
export function randomSeed(): bigint {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return bytes.reduce((n, byte) => (n << 8n) | BigInt(byte), 0n) >> 6n;
}

/**
 * Check that a key file is this project's: throws when the project has no
 * anonymous voting or another key.
 */
export async function validateAnonymousKeyForProject(
  projectName: string,
  uploadedPublicKey?: string,
): Promise<void> {
  const config = readResult(
    await tansuReads.get_anonymous_voting_config({
      project_key: deriveProjectKey(projectName),
    }),
    303,
  );
  if (!config) {
    throw new Error("Anonymous voting is not configured for this project");
  }
  if (uploadedPublicKey && uploadedPublicKey !== config.public_key) {
    throw new Error(
      "Key file does not match this project's anonymous voting key",
    );
  }
}

export interface DecodedVote {
  address: string;
  vote: "approve" | "reject" | "abstain";
  weight: number;
  /** The ballot's values and seeds, per choice (approve, reject, abstain). */
  outcomeWeights: bigint[];
  outcomeSeeds: bigint[];
}

/** A ballot that cannot count, and why: it must be removed to execute. */
export interface InvalidBallot {
  address: string;
  reason: string;
}

export interface AnonymousVotingData {
  /** Weighted sums per choice (approve, reject, abstain), valid ballots only. */
  tallies: bigint[];
  seeds: bigint[];
  voteStatus: VoteStatus;
  decodedVotes: DecodedVote[];
  invalid: InvalidBallot[];
  proofOk?: boolean | null;
  proofErrorMessage?: string | null;
}

/** A value as stored: in the clear (the proposer's own ballot) or encrypted. */
async function reveal(
  stored: string,
  prefix: string,
  privateKey: string,
): Promise<bigint> {
  if (/^\d+$/.test(stored)) return BigInt(stored);
  const text = await decryptWithPrivateKey(stored, privateKey);
  // Each value is bound to its voter, project and proposal.
  if (!text.startsWith(`${prefix}:`)) {
    throw new Error("it was encrypted for another voter or proposal");
  }
  const value = text.slice(prefix.length + 1);
  if (!/^\d+$/.test(value)) throw new Error("it holds no number");
  return BigInt(value);
}

/** A ballot's values and seeds, or why it cannot count. */
async function checkBallot(
  ballot: AnonymousVote,
  prefix: string,
  privateKey: string,
  projectKey: Buffer,
): Promise<{ votes: bigint[]; seeds: bigint[] } | { reason: string }> {
  let votes: bigint[];
  let seeds: bigint[];
  try {
    votes = await Promise.all(
      ballot.encrypted_votes.map((v) => reveal(v, prefix, privateKey)),
    );
    seeds = await Promise.all(
      ballot.encrypted_seeds.map((s) => reveal(s, prefix, privateKey)),
    );
  } catch (error: any) {
    return {
      reason: `It cannot be read with this key: ${error?.message ?? error}`,
    };
  }
  if (
    votes.length !== 3 ||
    seeds.length !== 3 ||
    votes.some((v) => v !== 0n && v !== 1n) ||
    votes.reduce((sum, v) => sum + v, 0n) !== 1n
  ) {
    return { reason: "It does not choose exactly one option." };
  }
  if (seeds.some((s) => s >= 1n << BigInt(SEED_BITS))) {
    return { reason: "Its seeds are out of range." };
  }
  // The ballot must be what the voter committed to on chain.
  const commitments = readResult(
    await tansuReads.build_commitments_from_votes({
      project_key: projectKey,
      votes,
      seeds,
    }),
  );
  const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");
  if (commitments.map(hex).join() !== ballot.commitments.map(hex).join()) {
    return { reason: "It does not match its commitments on chain." };
  }
  return { votes, seeds };
}

const CHOICES = ["approve", "reject", "abstain"] as const;

/**
 * Reveal a proposal's anonymous votes with the project's private key, and
 * optionally check the contract's proof over the tallies.
 */
export async function computeAnonymousVotingData(
  projectName: string,
  proposalId: number,
  privateKey: string,
  verifyProof = false,
): Promise<AnonymousVotingData> {
  const projectKey = deriveProjectKey(projectName);
  const proposal = readResult(
    await tansuReads.get_proposal({
      project_key: projectKey,
      proposal_id: proposalId,
    }),
  );

  const tallies = [0n, 0n, 0n];
  const seedSums = [0n, 0n, 0n];
  const decodedVotes: DecodedVote[] = [];
  const invalid: InvalidBallot[] = [];

  for (const vote of proposal.vote_data.votes) {
    if (vote.tag !== "AnonymousVote") continue;
    const [ballot] = vote.values;
    const prefix = `${ballot.address}:${projectName}:${proposalId}`;
    const checked = await checkBallot(ballot, prefix, privateKey, projectKey);
    if ("reason" in checked) {
      invalid.push({ address: ballot.address, reason: checked.reason });
      continue;
    }
    const weight = BigInt(ballot.weight);
    checked.votes.forEach((v, i) => {
      tallies[i]! += v * weight;
      seedSums[i]! += checked.seeds[i]! * weight;
    });
    decodedVotes.push({
      address: ballot.address,
      vote: CHOICES[checked.votes.indexOf(1n)]!,
      weight: ballot.weight,
      outcomeWeights: checked.votes,
      outcomeSeeds: checked.seeds,
    });
  }

  if (!decodedVotes.length && !invalid.length) {
    throw new Error("This proposal has no anonymous votes");
  }

  const voteStatus: VoteStatus = {
    approve: {
      voteType: VoteType.APPROVE,
      score: Number(tallies[0]),
      voters: [],
    },
    reject: {
      voteType: VoteType.REJECT,
      score: Number(tallies[1]),
      voters: [],
    },
    abstain: {
      voteType: VoteType.CANCEL,
      score: Number(tallies[2]),
      voters: [],
    },
  };
  const data: AnonymousVotingData = {
    tallies,
    seeds: seedSums,
    voteStatus,
    decodedVotes,
    invalid,
  };

  if (verifyProof) {
    try {
      data.proofOk =
        readResult(
          await tansuReads.proof({
            project_key: projectKey,
            proposal,
            tallies,
            seeds: seedSums,
          }),
        ) === true;
      data.proofErrorMessage = data.proofOk
        ? null
        : "The commitments on chain do not match these tallies.";
    } catch (error: any) {
      data.proofOk = false;
      data.proofErrorMessage = error?.message ?? String(error);
    }
  }
  return data;
}
