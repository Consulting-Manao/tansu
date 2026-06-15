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
  it("produces CSV with header and rows for decoded votes", () => {
    const votes: DecodedVote[] = [
      {
        address: "GAAA...",
        vote: "approve",
        seed: 42,
        weight: 5,
        maxWeight: 10,
        outcomeWeights: [5, 0, 0],
        outcomeSeeds: [42, 0, 0],
      },
      {
        address: "GBBB...",
        vote: "reject",
        seed: 99,
        weight: 3,
        maxWeight: 10,
        outcomeWeights: [0, 3, 0],
        outcomeSeeds: [0, 99, 0],
      },
    ];

    const csv = buildDecodedVotesCsv(votes);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(3);

    // Header
    expect(lines[0]).toBe(
      "Address,Vote,Weight (A/R/Abs),Max Weight,Seed (A/R/Abs)",
    );

    // Row 1
    expect(lines[1]).toBe("GAAA...,approve,5/0/0,10,42/0/0");

    // Row 2
    expect(lines[2]).toBe("GBBB...,reject,0/3/0,10,0/99/0");
  });

  it("handles string maxWeight (N/A for proposer)", () => {
    const votes: DecodedVote[] = [
      {
        address: "GAAA...",
        vote: "approve",
        seed: 1,
        weight: 10,
        maxWeight: "N/A",
        outcomeWeights: [10, 0, 0],
        outcomeSeeds: [1, 0, 0],
      },
    ];

    const csv = buildDecodedVotesCsv(votes);
    // N/A has no special chars so escapeCsvValue returns it unquoted
    expect(csv).toContain("10/0/0,N/A,1/0/0");
  });

  it("escapes values with commas from seed/weight display", () => {
    const votes: DecodedVote[] = [
      {
        address: "GAAA...",
        vote: "abstain",
        seed: 0,
        weight: 0,
        maxWeight: 5,
        outcomeWeights: [0, 0, 0],
        outcomeSeeds: [0, 0, 0],
      },
    ];

    const csv = buildDecodedVotesCsv(votes);
    const lastLine = csv.split("\n").pop()!;
    // No commas in the values themselves, so no quoting needed
    expect(lastLine).toContain("abstain");
    expect(lastLine).toContain("0/0/0");
  });

  it("returns header only for empty votes array", () => {
    const csv = buildDecodedVotesCsv([]);
    expect(csv).toBe("Address,Vote,Weight (A/R/Abs),Max Weight,Seed (A/R/Abs)");
  });
});
