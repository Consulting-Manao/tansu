import { describe, expect, it } from "vitest";
import { VoteType, type VoteStatus } from "../../../src/types/proposal";
import { countVoterProposalStats } from "../../../src/utils/utils";

const emptyVotes = (): VoteStatus => ({
  approve: { voteType: VoteType.APPROVE, score: 0, voters: [] },
  reject: { voteType: VoteType.REJECT, score: 0, voters: [] },
  abstain: { voteType: VoteType.CANCEL, score: 0, voters: [] },
});

const withVoter = (address: string): VoteStatus => {
  const status = emptyVotes();
  status.approve.voters.push({
    address,
    image: null,
    name: "",
    github: "",
  });
  return status;
};

describe("countVoterProposalStats", () => {
  const voter = "GABC";

  it("counts only active proposals as voted vs to vote", () => {
    const result = countVoterProposalStats(
      [
        { status: "active", voteStatus: withVoter(voter) },
        { status: "active", voteStatus: emptyVotes() },
        { status: "active", voteStatus: emptyVotes() },
        { status: "voted", voteStatus: withVoter(voter) },
        { status: "approved", voteStatus: emptyVotes() },
      ],
      voter,
    );

    expect(result).toEqual({ voted: 1, toVote: 2 });
  });

  it("returns zeros when address is missing", () => {
    expect(
      countVoterProposalStats(
        [{ status: "active", voteStatus: withVoter(voter) }],
        undefined,
      ),
    ).toEqual({ voted: 0, toVote: 1 });
  });
});
