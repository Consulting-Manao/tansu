import { describe, expect, it, vi } from "vitest";
import { computeAnonymousVotingData } from "../../../src/utils/anonymousVoting";

const { proofCalls } = vi.hoisted(() => ({
  proofCalls: [] as { tallies: bigint[]; seeds: bigint[] }[],
}));

vi.mock("../../../src/contracts/soroban_tansu", () => {
  // Votes and seeds stored as plain numbers are read without decryption.
  const voter = (
    address: string,
    weight: number,
    encrypted_votes: string[],
    encrypted_seeds: string[],
  ) => ({
    tag: "AnonymousVote",
    values: [{ address, weight, encrypted_votes, encrypted_seeds }],
  });
  return {
    tansuReads: {
      get_proposal: async () => ({
        result: {
          proposer: "GPROPOSER",
          vote_data: {
            public_voting: false,
            votes: [
              voter("GAPPROVE", 5, ["1", "0", "0"], ["7", "8", "9"]),
              voter("GREJECT", 2, ["0", "1", "0"], ["3", "4", "5"]),
              voter("GABSTAIN", 1, ["0", "0", "1"], ["1", "1", "1"]),
            ],
          },
        },
      }),
      get_max_weight: async () => ({ result: 5 }),
      proof: async (args: { tallies: bigint[]; seeds: bigint[] }) => {
        proofCalls.push(args);
        return { result: true };
      },
    },
  };
});

describe("computeAnonymousVotingData", () => {
  it("weighs every vote and proves the tallies it computed", async () => {
    const data = await computeAnonymousVotingData("demo", 1, "unused", true);

    expect(data.tallies).toEqual([5n, 2n, 1n]);
    // Seeds are weighted too: [7,8,9]·5 + [3,4,5]·2 + [1,1,1]·1
    expect(data.seeds).toEqual([42n, 49n, 56n]);
    expect(data.voteCounts).toEqual([1, 1, 1]);
    expect(data.decodedVotes.map((v) => [v.address, v.vote, v.seed])).toEqual([
      ["GAPPROVE", "approve", 7],
      ["GREJECT", "reject", 4],
      ["GABSTAIN", "abstain", 1],
    ]);
    expect(proofCalls).toHaveLength(1);
    expect(proofCalls[0]).toMatchObject({
      tallies: data.tallies,
      seeds: data.seeds,
    });
    expect(data.proofOk).toBe(true);
  });
});
