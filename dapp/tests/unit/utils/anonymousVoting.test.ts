import { describe, expect, it, vi } from "vitest";
import {
  buildCommitments,
  commitmentGenerators,
  computeAnonymousVotingData,
  randomSeed,
} from "../../../src/utils/anonymousVoting";

// The generators of every project, as the testnet contract reports them.
const { chain, config } = vi.hoisted(() => ({
  chain: { votes: [] as unknown[] },
  config: {
    public_key: "unused",
    vote_generator_point: Buffer.from(
      "079aef6edc9e52f22545eba04d1d487beea4f58ddae61913e96cc4f048c14d866b80d35a23ae43244391977701a0687d0f839fd41e7a42655a692356595c9409347564340a1012ff2fadabb0beb426061b80c13aedb9a916faf7a39071b86a0a",
      "hex",
    ),
    seed_generator_point: Buffer.from(
      "0fd6bac507d0d965a7ba3a037348ef398f487fd770bd2a3039ba0c7bd259f3527784ce24c0f3f2ea35e6acc49310f00101f5e1b09d073f84bb56cb459d9c9028e0f0a63f170bba87dafb12d584bb06af8b84069af7c80a386abb1fc4d5908680",
      "hex",
    ),
  },
}));

vi.mock("../../../src/contracts/soroban_tansu", () => ({
  tansuReads: {
    get_proposal: async () => ({
      result: { vote_data: { votes: chain.votes } },
    }),
    get_anonymous_voting_config: async () => ({ result: config }),
  },
}));

const ORDER =
  0x73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001n;
const generators = commitmentGenerators(config);

// Values stored as plain numbers are read without decryption.
const ballot = (
  address: string,
  weight: number,
  votes: bigint[],
  seeds: bigint[],
  committed = votes,
) => ({
  tag: "AnonymousVote",
  values: [
    {
      address,
      weight,
      encrypted_votes: votes.map(String),
      encrypted_seeds: seeds.map(String),
      commitments: buildCommitments(generators, committed, seeds),
    },
  ],
});

const valid = [
  ballot("GAPPROVE", 5, [1n, 0n, 0n], [7n, 8n, 9n]),
  ballot("GREJECT", 2, [0n, 1n, 0n], [3n, 4n, 5n]),
  ballot("GABSTAIN", 4, [0n, 0n, 1n], [ORDER - 1n, ORDER - 1n, ORDER - 1n]),
];

describe("buildCommitments", () => {
  it("encodes the points the contract builds", () => {
    // build_commitments_from_votes on testnet, for the same votes and seeds
    const commitments = buildCommitments(
      generators,
      [1n, 0n, 0n],
      [123n, (1n << 127n) - 1n, 0n],
    ).map((c) => c.toString("hex"));
    expect(commitments).toEqual([
      "04ff379bf94de199d5f5ad9fdd06859d8278973ccd314a6aad3a30921f40057b6e0f8c7b34ded9dbde86dd3fe0c629b10326735d4f2f242770d8dfd95202c83c771d1d93fca00a82026834d0acea4806d27de4b593bd913d84d2cd0e54046088",
      "11aec2e01f025eb43b6224b16eefec941dbf606358aa180d890f575a5913a9cc9d9a29e4d2615fb315af262fdd8a417700eab72664e268dac33aad1c98fdacb45bb2b8dc4994fc2664d5465f4e467fdda82db1e6203373b69f81e63acfdff67d",
      `40${"0".repeat(190)}`,
    ]);
  });
});

describe("computeAnonymousVotingData", () => {
  it("weighs valid ballots, with seeds summed modulo the order", async () => {
    chain.votes = valid;
    const data = await computeAnonymousVotingData("demo", 1, "unused", true);

    expect(data.tallies).toEqual([5n, 2n, 4n]);
    // [7,8,9]·5 + [3,4,5]·2 + (order - 1)·4
    expect(data.seeds).toEqual([37n, 44n, 51n]);
    expect(data.invalid).toEqual([]);
    expect(data.proofOk).toBe(true);
  });

  it("lists the ballots that cannot count, which fail the proof", async () => {
    chain.votes = [
      ...valid,
      // A voter's own client can commit to any values.
      ballot("GINFLATED", 3, [1000n, 0n, 0n], [1n, 1n, 1n]),
      ballot("GBOTH", 1, [1n, 1n, 0n], [1n, 1n, 1n]),
      ballot("GSWAPPED", 1, [1n, 0n, 0n], [1n, 1n, 1n], [0n, 1n, 0n]),
    ];
    const data = await computeAnonymousVotingData("demo", 1, "unused", true);

    expect(data.tallies).toEqual([5n, 2n, 4n]);
    expect(data.decodedVotes.map((v) => [v.address, v.vote])).toEqual([
      ["GAPPROVE", "approve"],
      ["GREJECT", "reject"],
      ["GABSTAIN", "abstain"],
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
    expect(data.proofOk).toBe(false);
  });
});

describe("randomSeed", () => {
  it("draws seeds below the group's order", () => {
    const seeds = Array.from({ length: 200 }, randomSeed);
    expect(seeds.every((s) => s >= 0n && s < ORDER)).toBe(true);
    // Over 200 draws, the top bits are used.
    expect(seeds.some((s) => s >= 1n << 250n)).toBe(true);
  });
});
