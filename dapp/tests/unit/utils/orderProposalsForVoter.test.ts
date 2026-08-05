import { describe, expect, it } from "vitest";
import {
  VoteType,
  type ProposalView,
  type VoteStatus,
} from "../../../src/types/proposal";
import { orderProposalsForVoter } from "../../../src/utils/utils";

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

function proposal(
  id: number,
  status: ProposalView["status"],
  voteStatus: VoteStatus,
): ProposalView {
  return {
    id,
    title: `p${id}`,
    proposer: "GPROP",
    projectName: "test",
    publicVoting: true,
    ipfsLink: "",
    status,
    endDate: 0,
    voteStatus,
  };
}

describe("orderProposalsForVoter", () => {
  const voter = "GABC";

  it("sorts newest-first when logged out", () => {
    const result = orderProposalsForVoter(
      [
        proposal(1, "active", emptyVotes()),
        proposal(3, "approved", emptyVotes()),
        proposal(2, "active", emptyVotes()),
      ],
      undefined,
    );
    expect(result.map((p) => p.id)).toEqual([3, 2, 1]);
  });

  it("puts active unvoted first (shuffled), then rest newest-first", () => {
    // Fisher-Yates with random() always 0 swaps i with 0 → reverses the group.
    const random = () => 0;
    const result = orderProposalsForVoter(
      [
        proposal(1, "active", emptyVotes()),
        proposal(4, "approved", emptyVotes()),
        proposal(2, "active", withVoter(voter)),
        proposal(3, "active", emptyVotes()),
        proposal(5, "voted", emptyVotes()),
      ],
      voter,
      random,
    );

    expect(result.map((p) => p.id)).toEqual([3, 1, 5, 4, 2]);
  });
});
