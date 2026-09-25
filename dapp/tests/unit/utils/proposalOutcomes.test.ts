import { describe, expect, it } from "vitest";
import {
  emptyOutcome,
  outcomeSlots,
  storedOutcomes,
  winningOutcome,
  type OutcomeDraft,
} from "../../../src/utils/proposalOutcomes";
import { VoteType, type VoteStatus } from "../../../src/types/proposal";

const SAC = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const call = (fn: string, ...args: string[]): OutcomeDraft => ({
  ...emptyOutcome(),
  description: `Runs ${fn}`,
  call: { address: SAC, execute_fn: fn, args },
});

describe("outcome slots", () => {
  it("puts each call at its outcome's position, a gap before the last as null", () => {
    expect(outcomeSlots({ cancelled: call("burn", "1") })).toEqual([
      null,
      null,
      { address: SAC, execute_fn: "burn", args: ["1"] },
    ]);
    expect(
      outcomeSlots({ approved: call("mint", "5"), cancelled: call("burn") }),
    ).toEqual([
      { address: SAC, execute_fn: "mint", args: ["5"] },
      null,
      { address: SAC, execute_fn: "burn", args: [] },
    ]);
  });

  it("has no calls without a complete one", () => {
    expect(outcomeSlots({})).toBeUndefined();
    expect(
      outcomeSlots({
        approved: { ...call("mint"), mode: "xdr" },
        rejected: {
          ...call(""),
          call: { address: SAC, execute_fn: "", args: [] },
        },
      }),
    ).toBeUndefined();
  });
});

describe("outcomes.json", () => {
  it("writes what each added outcome means and runs, and nothing for removed ones", () => {
    expect(
      storedOutcomes({
        approved: call("mint", "5"),
        rejected: {
          ...emptyOutcome(),
          mode: "xdr",
          xdr: " AAAA ",
          description: "Refund",
        },
        cancelled: { ...emptyOutcome(), description: "" },
      }),
    ).toEqual({
      outcomes: {
        approved: {
          description: "Runs mint",
          execution: {
            type: "contract",
            contract: { address: SAC, execute_fn: "mint", args: ["5"] },
          },
        },
        rejected: {
          description: "Refund",
          execution: { type: "xdr", xdr: "AAAA" },
        },
      },
    });
  });
});

describe("winningOutcome", () => {
  const votes = (approve: number, reject: number, abstain: number) =>
    ({
      approve: { voteType: VoteType.APPROVE, score: approve, voters: [] },
      reject: { voteType: VoteType.REJECT, score: reject, voters: [] },
      abstain: { voteType: VoteType.CANCEL, score: abstain, voters: [] },
    }) as VoteStatus;

  it("needs more than the other two choices together, as execute does", () => {
    expect(winningOutcome(votes(5, 2, 2))).toBe("approved");
    expect(winningOutcome(votes(2, 5, 2))).toBe("rejected");
    // Abstentions count against both.
    expect(winningOutcome(votes(4, 2, 2))).toBe("cancelled");
    expect(winningOutcome(votes(0, 0, 0))).toBe("cancelled");
  });
});
