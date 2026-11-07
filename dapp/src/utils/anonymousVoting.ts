/**
 * Anonymous votes, as a maintainer reveals them with the project's key: each
 * ballot decrypted and checked, and the valid ones summed into the tallies
 * and seeds `execute` proves against the commitments on chain.
 *
 * A commitment is `g·vote + h·seed` on BLS12-381, computed here as the
 * contract's `build_commitments_from_votes` does: a simulation would send the
 * votes and seeds to the RPC server, and `proof` through one stops at about
 * 37 ballots, the 400 million instructions of a transaction.
 */
import { bls12_381 } from "@noble/curves/bls12-381.js";
import { Buffer } from "buffer";
import type { AnonymousVote, AnonymousVoteConfig } from "../../packages/tansu";
import { tansuReads } from "../contracts/soroban_tansu";
import type { VoteStatus } from "types/proposal";
import { VoteType } from "types/proposal";
import { readResult } from "./contractErrors";
import { decryptWithPrivateKey } from "./crypto";
import { deriveProjectKey } from "./projectKey";

const G1 = bls12_381.G1.Point;
type G1Point = typeof G1.BASE;

/** The order of the group: seeds, and their sums, are taken modulo it. */
const ORDER = bls12_381.fields.Fr.ORDER;

/** A random seed below the group's order, to blind one value of a ballot. */
export function randomSeed(): bigint {
  // 384 bits reduced modulo the 255-bit order: uniform to within 2^-128.
  const bytes = crypto.getRandomValues(new Uint8Array(48));
  return bytes.reduce((n, byte) => (n << 8n) | BigInt(byte), 0n) % ORDER;
}

/** `point·n`, with `n` taken modulo the order: noble refuses a zero scalar. */
function times(point: G1Point, n: bigint): G1Point {
  const k = n % ORDER;
  return k === 0n ? G1.ZERO : point.multiply(k);
}

/** The project's generators `g` and `h`, ready for many multiplications. */
export function commitmentGenerators(config: AnonymousVoteConfig) {
  const g = G1.fromBytes(config.vote_generator_point);
  const h = G1.fromBytes(config.seed_generator_point);
  g.precompute(8);
  h.precompute(8);
  return { g, h };
}

/** The commitments `g·vote + h·seed` of a ballot, as the contract encodes them. */
export function buildCommitments(
  { g, h }: { g: G1Point; h: G1Point },
  votes: bigint[],
  seeds: bigint[],
): Buffer[] {
  return votes.map((vote, i) =>
    Buffer.from(times(g, vote).add(times(h, seeds[i]!)).toBytes(false)),
  );
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
  generators: { g: G1Point; h: G1Point },
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
  // The ballot must be what the voter committed to on chain.
  const commitments = buildCommitments(generators, votes, seeds);
  if (
    ballot.commitments.length !== 3 ||
    commitments.some((c, i) => !c.equals(Buffer.from(ballot.commitments[i]!)))
  ) {
    return { reason: "It does not match its commitments on chain." };
  }
  return { votes, seeds };
}

const CHOICES = ["approve", "reject", "abstain"] as const;

/**
 * Reveal a proposal's anonymous votes with the project's private key, and
 * optionally check the tallies as the contract's `proof` does: the weighted
 * sum of the commitments on chain against `g·tally + h·seed`.
 */
export async function computeAnonymousVotingData(
  projectName: string,
  proposalId: number,
  privateKey: string,
  verifyProof = false,
): Promise<AnonymousVotingData> {
  const projectKey = deriveProjectKey(projectName);
  const [proposal, config] = await Promise.all([
    tansuReads
      .get_proposal({ project_key: projectKey, proposal_id: proposalId })
      .then((tx) => readResult(tx)),
    tansuReads
      .get_anonymous_voting_config({ project_key: projectKey })
      .then((tx) => readResult(tx, 303)),
  ]);
  if (!config) {
    throw new Error("Anonymous voting is not configured for this project");
  }
  const generators = commitmentGenerators(config);

  const tallies = [0n, 0n, 0n];
  const seedSums = [0n, 0n, 0n];
  const decodedVotes: DecodedVote[] = [];
  const invalid: InvalidBallot[] = [];

  for (const vote of proposal.vote_data.votes) {
    if (vote.tag !== "AnonymousVote") continue;
    const [ballot] = vote.values;
    const prefix = `${ballot.address}:${projectName}:${proposalId}`;
    const checked = await checkBallot(ballot, prefix, privateKey, generators);
    if ("reason" in checked) {
      invalid.push({ address: ballot.address, reason: checked.reason });
      continue;
    }
    const weight = BigInt(ballot.weight);
    checked.votes.forEach((v, i) => {
      tallies[i]! += v * weight;
      seedSums[i] = (seedSums[i]! + checked.seeds[i]! * weight) % ORDER;
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
      // Every ballot on chain counts, as in `proof`: an invalid one makes it
      // fail until it is removed.
      const sums = [G1.ZERO, G1.ZERO, G1.ZERO];
      for (const vote of proposal.vote_data.votes) {
        if (vote.tag !== "AnonymousVote") continue;
        const [ballot] = vote.values;
        if (ballot.weight === 0) continue;
        ballot.commitments.forEach((c, i) => {
          sums[i] = sums[i]!.add(
            G1.fromBytes(c).multiplyUnsafe(BigInt(ballot.weight)),
          );
        });
      }
      data.proofOk = sums.every((sum, i) =>
        sum.equals(
          times(generators.g, tallies[i]!).add(
            times(generators.h, seedSums[i]!),
          ),
        ),
      );
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
