import { describe, it, expect } from "vitest";
import {
  escapeCsvValue,
  buildDecodedVotesCsv,
} from "../../../src/utils/anonymousVotingCsv";
import type { DecodedVote } from "../../../src/utils/anonymousVoting";

describe("escapeCsvValue", () => {
  it("passes through simple values unchanged", () => {
    expect(escapeCsvValue("hello")).toBe("hello");
    expect(escapeCsvValue("1")).toBe("1");
    expect(escapeCsvValue("")).toBe("");
  });

  it("wraps values containing commas in double quotes", () => {
    expect(escapeCsvValue("a,b")).toBe('"a,b"');
    expect(escapeCsvValue("1,2,3")).toBe('"1,2,3"');
  });

  it("wraps values containing newlines in double quotes", () => {
    expect(escapeCsvValue("line1\nline2")).toBe('"line1\nline2"');
  });

  it("wraps values containing double quotes and escapes embedded quotes", () => {
    expect(escapeCsvValue('say "hello"')).toBe('"say ""hello"""');
  });

  it("converts non-string values to string", () => {
    expect(escapeCsvValue(42)).toBe("42");
    expect(escapeCsvValue(null)).toBe("");
    expect(escapeCsvValue(undefined)).toBe("");
    expect(escapeCsvValue(0)).toBe("0");
  });
});

describe("buildDecodedVotesCsv", () => {
  const HEADER = "Address,Vote,Weight,Votes (A/R/Abs),Seeds (A/R/Abs)";

  it("writes a row per ballot, with its values and 90-bit seeds", () => {
    const seed = (1n << 89n) + 7n;
    const votes: DecodedVote[] = [
      {
        address: "GAAA",
        vote: "approve",
        weight: 5,
        outcomeWeights: [1n, 0n, 0n],
        outcomeSeeds: [seed, 1n, 2n],
      },
      {
        address: "GBBB",
        vote: "reject",
        weight: 3,
        outcomeWeights: [0n, 1n, 0n],
        outcomeSeeds: [0n, 99n, 0n],
      },
    ];
    expect(buildDecodedVotesCsv(votes).split("\n")).toEqual([
      HEADER,
      `GAAA,approve,5,1/0/0,${seed}/1/2`,
      "GBBB,reject,3,0/1/0,0/99/0",
    ]);
  });

  it("is the header alone without ballots", () => {
    expect(buildDecodedVotesCsv([])).toBe(HEADER);
  });
});
