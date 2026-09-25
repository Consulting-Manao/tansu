import { describe, expect, it, vi } from "vitest";
import {
  computeAnonymousVotingData,
  randomSeed,
} from "../../../src/utils/anonymousVoting";

const { proofCalls } = vi.hoisted(() => ({
  proofCalls: [] as { tallies: bigint[]; seeds: bigint[] }[],
}));

// Commitments stand in as "vote:seed" bytes, as the contract would commit.
const commit = (votes: bigint[], seeds: bigint[]) =>
  votes.map((v, i) => Buffer.from(`${v}:${seeds[i]}`));

vi.mock("../../../src/contracts/soroban_tansu", () => {
  // Values stored as plain numbers are read without decryption.
  const ballot = (
    address: string,
    weight: number,
    votes: number[],
    seeds: number[],
    committed = votes,
  ) => ({
    tag: "AnonymousVote",
    values: [
      {
        address,
        weight,
        encrypted_votes: votes.map(String),
        encrypted_seeds: seeds.map(String),
        commitments: commit(committed.map(BigInt), seeds.map(BigInt)),
      },
    ],
  });
  return {
    tansuReads: {
      get_proposal: async () => ({
        result: {
          vote_data: {
            votes: [
              ballot("GAPPROVE", 5, [1, 0, 0], [7, 8, 9]),
              ballot("GREJECT", 2, [0, 1, 0], [3, 4, 5]),
              // A voter's own client can commit to any values.
              ballot("GINFLATED", 3, [1000, 0, 0], [1, 1, 1]),
              ballot("GBOTH", 1, [1, 1, 0], [1, 1, 1]),
              ballot("GSWAPPED", 1, [1, 0, 0], [1, 1, 1], [0, 1, 0]),
            ],
          },
        },
      }),
      build_commitments_from_votes: async (args: {
        votes: bigint[];
        seeds: bigint[];
      }) => ({ result: commit(args.votes, args.seeds) }),
      proof: async (args: { tallies: bigint[]; seeds: bigint[] }) => {
        proofCalls.push(args);
        return { result: true };
      },
    },
  };
});

describe("computeAnonymousVotingData", () => {
  it("weighs valid ballots, lists the others, and proves the tallies", async () => {
    const data = await computeAnonymousVotingData("demo", 1, "unused", true);

    expect(data.tallies).toEqual([5n, 2n, 0n]);
    // Seeds are weighted too: [7,8,9]·5 + [3,4,5]·2
    expect(data.seeds).toEqual([41n, 48n, 55n]);
    expect(data.decodedVotes.map((v) => [v.address, v.vote])).toEqual([
      ["GAPPROVE", "approve"],
      ["GREJECT", "reject"],
    ]);
    expect(data.invalid).toEqual([
      {
        address: "GINFLATED",
        reason: "It does not choose exactly one option.",
      },
      { address: "GBOTH", reason: "It does not choose exactly one option." },
      {
        address: "GSWAPPED",
        reason: "It does not match its commitments on chain.",
      },
    ]);
    expect(proofCalls).toEqual([
      { ...proofCalls[0], tallies: data.tallies, seeds: data.seeds },
    ]);
    expect(data.proofOk).toBe(true);
  });
});

describe("randomSeed", () => {
  it("draws 90-bit seeds", () => {
    const seeds = Array.from({ length: 200 }, randomSeed);
    expect(seeds.every((s) => s >= 0n && s < 1n << 90n)).toBe(true);
    // Over 200 draws, the top bits are used.
    expect(seeds.some((s) => s >= 1n << 80n)).toBe(true);
  });
});
