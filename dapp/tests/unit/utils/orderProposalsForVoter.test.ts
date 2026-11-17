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
  const order = (
    proposals: ProposalView[],
    address: string | undefined,
    seed: string,
  ) => {
    const { inProgress, done } = orderProposalsForVoter(
      proposals,
      address,
      seed,
    );
    return { inProgress: ids(inProgress), done: ids(done) };
  };

  it("groups newest first when logged out", () => {
    const result = order(
      [
        proposal(1, "active", emptyVotes()),
        proposal(3, "approved", emptyVotes()),
        proposal(2, "active", emptyVotes()),
        proposal(4, "voted", emptyVotes()),
        proposal(5, "vetoed", emptyVotes()),
      ],
      undefined,
      "seed",
    );
    expect(result).toEqual({ inProgress: [4, 2, 1], done: [5, 3] });
  });

  it("puts what is left to vote on first, then the rest in progress, then done", () => {
    const result = order(
      [
        proposal(1, "active", emptyVotes()),
        proposal(4, "approved", emptyVotes()),
        proposal(2, "active", withVoter(voter)),
        proposal(3, "active", emptyVotes()),
        proposal(5, "voted", emptyVotes()),
        proposal(6, "approved", withVoter(voter)),
        proposal(7, "cancelled", emptyVotes()),
      ],
      voter,
      "seed",
    );
    expect(result.inProgress.slice(0, 2).sort()).toEqual([1, 3]);
    expect(result.inProgress.slice(2)).toEqual([5, 2]);
    expect(result.done).toEqual([7, 6, 4]);
  });

  it("keeps a visitor's order as they vote", () => {
    const active = Array.from({ length: 12 }, (_, id) =>
      proposal(id, "active", emptyVotes()),
    );
    const before = order(active, voter, "seed").inProgress;
    expect(order(active, voter, "seed").inProgress).toEqual(before);
    // Not just newest first, and another visitor gets another order.
    expect(before).not.toEqual([...before].sort((a, b) => b - a));
    expect(order(active, voter, "other").inProgress).not.toEqual(before);

    // A vote on the third moves it after the ones left to vote on; the
    // others keep their places.
    const votedOn = before[2]!;
    const after = order(
      active.map((p) => (p.id === votedOn ? { ...p, voters: [voter] } : p)),
      voter,
      "seed",
    ).inProgress;
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
