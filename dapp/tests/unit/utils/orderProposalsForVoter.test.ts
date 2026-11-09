import { afterEach, describe, expect, it, vi } from "vitest";
import {
  VoteType,
  type ProposalView,
  type VoteStatus,
} from "../../../src/types/proposal";
import { orderProposalsForVoter, visitorSeed } from "../../../src/utils/utils";

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
    voters: voteStatus.approve.voters.map((v) => v.address),
  };
}

describe("orderProposalsForVoter", () => {
  const voter = "GABC";
  const ids = (list: ProposalView[]) => list.map((p) => p.id);

  it("sorts newest-first when logged out", () => {
    const result = orderProposalsForVoter(
      [
        proposal(1, "active", emptyVotes()),
        proposal(3, "approved", emptyVotes()),
        proposal(2, "active", emptyVotes()),
      ],
      undefined,
      "seed",
    );
    expect(ids(result)).toEqual([3, 2, 1]);
  });

  it("puts what is left to vote on first, then ended, then voted", () => {
    const result = orderProposalsForVoter(
      [
        proposal(1, "active", emptyVotes()),
        proposal(4, "approved", emptyVotes()),
        proposal(2, "active", withVoter(voter)),
        proposal(3, "active", emptyVotes()),
        proposal(5, "voted", emptyVotes()),
        proposal(6, "approved", withVoter(voter)),
      ],
      voter,
      "seed",
    );
    expect(ids(result).slice(0, 2).sort()).toEqual([1, 3]);
    expect(ids(result).slice(2)).toEqual([5, 4, 6, 2]);
  });

  it("keeps a visitor's order as they vote", () => {
    const active = Array.from({ length: 12 }, (_, id) =>
      proposal(id, "active", emptyVotes()),
    );
    const before = ids(orderProposalsForVoter(active, voter, "seed"));
    expect(ids(orderProposalsForVoter(active, voter, "seed"))).toEqual(before);
    // Not just newest first, and another visitor gets another order.
    expect(before).not.toEqual([...before].sort((a, b) => b - a));
    expect(ids(orderProposalsForVoter(active, voter, "other"))).not.toEqual(
      before,
    );

    // A vote on the third moves it last; the others keep their places.
    const votedOn = before[2]!;
    const after = ids(
      orderProposalsForVoter(
        active.map((p) => (p.id === votedOn ? { ...p, voters: [voter] } : p)),
        voter,
        "seed",
      ),
    );
    expect(after).toEqual([...before.filter((id) => id !== votedOn), votedOn]);
  });
});

describe("visitorSeed", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is made once and kept", () => {
    const data = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
    });
    const seed = visitorSeed();
    expect(seed).toMatch(/^[0-9a-f-]{36}$/);
    expect(visitorSeed()).toBe(seed);
  });

  it("lasts the visit without storage", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
    });
    expect(visitorSeed()).toBe(visitorSeed());
  });
});
