import { describe, expect, it } from "vitest";
import { countVoterProposalStats } from "../../../src/utils/utils";

describe("countVoterProposalStats", () => {
  const voter = "GABC";

  it("counts only active proposals as voted vs to vote", () => {
    const result = countVoterProposalStats(
      [
        { status: "active", voters: [voter] },
        { status: "active", voters: [] },
        { status: "active", voters: ["GOTHER"] },
        { status: "voted", voters: [voter] },
        { status: "approved", voters: [] },
      ],
      voter,
    );

    expect(result).toEqual({ voted: 1, toVote: 2 });
  });

  it("returns zeros when address is missing", () => {
    expect(
      countVoterProposalStats(
        [{ status: "active", voters: [voter] }],
        undefined,
      ),
    ).toEqual({ voted: 0, toVote: 1 });
  });
});
