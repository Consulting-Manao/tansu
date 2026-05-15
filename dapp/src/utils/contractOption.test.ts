import { describe, it, expect } from "vitest";
import { parseContractOptionString, MAX_VOTE_WEIGHT_U32 } from "./utils";
import {
  stroopsToTokenUnits,
  tokenUnitsToStroops,
  toMaxVoteWeightInTokens,
  tokenVoteWeightToContract,
  SOROBAN_CONTRACT_ID_REGEX,
} from "../service/TokenBalanceService";

describe("parseContractOptionString", () => {
  it("returns null for empty values", () => {
    expect(parseContractOptionString(null)).toBeNull();
    expect(parseContractOptionString("")).toBeNull();
    expect(parseContractOptionString({ tag: "None" })).toBeNull();
  });
});

describe("token units via SAC decimals", () => {
  const tenKXlmStroops = 10_000n * 10_000_000n;

  it("converts stroops to whole tokens with 7 decimals", () => {
    expect(stroopsToTokenUnits(tenKXlmStroops, 7)).toBe(10_000n);
  });

  it("converts whole tokens back to stroops for display math", () => {
    expect(tokenUnitsToStroops(10_000n, 7)).toBe(tenKXlmStroops);
  });

  it("max vote weight is in whole tokens", () => {
    expect(toMaxVoteWeightInTokens(tenKXlmStroops, 7)).toBe(10_000);
    expect(toMaxVoteWeightInTokens(100n * 10_000_000n, 7)).toBe(100);
  });

  it("caps vote weight at u32 when balance exceeds on-chain max", () => {
    const overCapStroops = (BigInt(MAX_VOTE_WEIGHT_U32) + 1n) * 10_000_000n;
    expect(toMaxVoteWeightInTokens(overCapStroops, 7)).toBe(
      MAX_VOTE_WEIGHT_U32,
    );
  });

  it("passes whole token weight to contract unchanged", () => {
    expect(tokenVoteWeightToContract(100)).toBe(100);
  });

  it("returns 0 for zero balance", () => {
    expect(toMaxVoteWeightInTokens(0n, 7)).toBe(0);
  });
});

describe("SOROBAN_CONTRACT_ID_REGEX", () => {
  it("accepts C addresses only", () => {
    expect(
      SOROBAN_CONTRACT_ID_REGEX.test(
        "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
      ),
    ).toBe(true);
  });
});
