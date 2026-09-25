import { describe, it, expect, vi, beforeEach } from "vitest";

// A file read: its text, `null` when missing, or a rejection.
const mockReadIpfs = vi.fn();

vi.mock("../../../src/utils/ipfsFunctions", () => ({
  ipfsQuery: (cid: string, path: string) => ({
    queryKey: ["ipfs", cid, path],
    queryFn: () => mockReadIpfs(cid, path),
  }),
}));

/** outcomes.json holding `data`. */
const outcomesFile = (data: unknown) => JSON.stringify(data);

import {
  fetchProposalOutcomeData,
  fetchProposalFromIPFS,
  fetchProposalDiscussionFromIPFS,
  fetchProposalDiscussionSummaryFromIPFS,
  normalizeOutcomeData,
  resolveDiscussionCid,
} from "../../../src/service/ProposalService";
import type { Proposal, OutcomeContract } from "../../../src/types/proposal";
import { queryClient } from "../../../src/service/queryClient";
import { NO_CALL } from "../../../src/service/ContractIntrospectionService";

// Every test reads its own files.
beforeEach(() => queryClient.clear());

function makeContract(
  overrides: Partial<OutcomeContract> = {},
): OutcomeContract {
  return {
    address: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
    execute_fn: "transfer",
    args: [],
    ...overrides,
  };
}

function makeProposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    id: 1,
    title: "Test Proposal",
    ipfs: "",
    proposer: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
    publicVoting: false,
    status: "active",
    voting_ends_at: 1_777_000_000,
    voteStatus: {
      approve: { voteType: "approve" as any, score: 0, voters: [] },
      reject: { voteType: "reject" as any, score: 0, voters: [] },
      abstain: { voteType: "abstain" as any, score: 0, voters: [] },
    },
    ...overrides,
  };
}

describe("fetchProposalOutcomeData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty object when proposal has no IPFS and no outcome_contracts", async () => {
    const proposal = makeProposal();
    const result = await fetchProposalOutcomeData(proposal);
    expect(result).toEqual({});
    expect(mockReadIpfs).not.toHaveBeenCalled();
  });

  it("loads IPFS outcome data as the base when IPFS CID is provided", async () => {
    mockReadIpfs.mockResolvedValue(
      outcomesFile({
        approved: {
          description: "Approved from IPFS",
        },
      }),
    );

    const proposal = makeProposal({ ipfs: "bafyabc123" });
    const result = await fetchProposalOutcomeData(proposal);

    expect(result.approved?.description).toBe("Approved from IPFS");
    expect(mockReadIpfs).toHaveBeenCalledWith("bafyabc123", "/outcomes.json");
  });

  it("merges contract outcome data on top of IPFS data", async () => {
    mockReadIpfs.mockResolvedValue(
      outcomesFile({
        approved: {
          description: "IPFS description",
        },
        rejected: {
          description: "IPFS rejected description",
        },
      }),
    );

    const approvedContract = makeContract({ address: "CAAAAA...approved" });
    const rejectedContract = makeContract({ address: "CAAAAA...rejected" });

    const proposal = makeProposal({
      ipfs: "bafyabc123",
      outcome_contracts: [approvedContract, rejectedContract, null as any],
    });

    const result = await fetchProposalOutcomeData(proposal);

    expect(result.approved?.description).toBe("IPFS description");
    expect(result.approved?.contract?.address).toBe("CAAAAA...approved");
    expect(result.rejected?.description).toBe("IPFS rejected description");
    expect(result.rejected?.contract?.address).toBe("CAAAAA...rejected");
  });

  it("falls back to contract-based default description when IPFS has none", async () => {
    mockReadIpfs.mockResolvedValue(
      outcomesFile({
        rejected: { description: "Has IPFS" },
      }),
    );

    const approvedContract = makeContract({
      address: "CAAAAA...approve",
      execute_fn: "transfer",
    });
    const rejectedContract = makeContract({
      address: "CAAAAA...reject",
      execute_fn: "burn",
    });

    const proposal = makeProposal({
      ipfs: "bafyabc123",
      outcome_contracts: [approvedContract, rejectedContract, null as any],
    });

    const result = await fetchProposalOutcomeData(proposal);

    expect(result.approved?.description).toBe("Contract execution: transfer");
    expect(result.approved?.contract?.address).toBe("CAAAAA...approve");
    expect(result.rejected?.description).toBe("Has IPFS");
    expect(result.rejected?.contract?.address).toBe("CAAAAA...reject");
    expect(result.cancelled).toBeUndefined();
  });

  it("handles partial outcome_contracts (only approved)", async () => {
    mockReadIpfs.mockResolvedValue(outcomesFile({}));
    const approvedContract = makeContract({ address: "CAAAAA...only" });

    const proposal = makeProposal({
      ipfs: "bafyabc123",
      outcome_contracts: [approvedContract, null as any, null as any],
    });

    const result = await fetchProposalOutcomeData(proposal);
    expect(result.approved?.contract?.address).toBe("CAAAAA...only");
    expect(result.rejected).toBeUndefined();
    expect(result.cancelled).toBeUndefined();
  });

  it("handles outcome_contracts with all three outcomes including cancelled", async () => {
    mockReadIpfs.mockResolvedValue(outcomesFile({}));
    const approved = makeContract({
      address: "C...approved",
      execute_fn: "mint",
    });
    const rejected = makeContract({
      address: "C...rejected",
      execute_fn: "freeze",
    });
    const cancelled = makeContract({
      address: "C...cancelled",
      execute_fn: "pause",
    });

    const proposal = makeProposal({
      ipfs: "bafyabc123",
      outcome_contracts: [approved, rejected, cancelled],
    });

    const result = await fetchProposalOutcomeData(proposal);
    expect(result.approved?.contract?.address).toBe("C...approved");
    expect(result.approved?.description).toBe("Contract execution: mint");
    expect(result.rejected?.contract?.address).toBe("C...rejected");
    expect(result.rejected?.description).toBe("Contract execution: freeze");
    expect(result.cancelled?.contract?.address).toBe("C...cancelled");
    expect(result.cancelled?.description).toBe("Contract execution: pause");
  });

  it("hides the call that fills an empty slot", async () => {
    mockReadIpfs.mockResolvedValue(outcomesFile({}));
    const cancelled = makeContract({ address: "C...cancelled" });
    const proposal = makeProposal({
      ipfs: "bafyabc123",
      outcome_contracts: [NO_CALL, NO_CALL, cancelled],
    });

    const result = await fetchProposalOutcomeData(proposal);
    expect(result.approved).toBeUndefined();
    expect(result.rejected).toBeUndefined();
    expect(result.cancelled?.contract?.address).toBe("C...cancelled");
  });

  it("IPFS fetch failure does not block contract data", async () => {
    mockReadIpfs.mockRejectedValue(new Error("IPFS timeout"));
    const approvedContract = makeContract({ address: "C...still-works" });

    const proposal = makeProposal({
      ipfs: "bafyabc123",
      outcome_contracts: [approvedContract, null as any, null as any],
    });

    const result = await fetchProposalOutcomeData(proposal);
    expect(mockReadIpfs).toHaveBeenCalled();
    expect(result.approved?.contract?.address).toBe("C...still-works");
    expect(result.approved?.description).toBe("Contract execution: transfer");
  });

  it("handles proposals with no outcome_contracts field", async () => {
    mockReadIpfs.mockResolvedValue(
      outcomesFile({
        approved: { description: "IPFS only" },
      }),
    );
    const proposal = makeProposal({ ipfs: "bafyabc123" });
    delete (proposal as any).outcome_contracts;
    const result = await fetchProposalOutcomeData(proposal);
    expect(result.approved?.description).toBe("IPFS only");
    expect(result.approved?.contract).toBeUndefined();
  });

  it("preserves IPFS XDR data when no contract overrides it", async () => {
    mockReadIpfs.mockResolvedValue(
      outcomesFile({
        approved: {
          description: "Has XDR",
          xdr: "AAAAAH...",
        },
      }),
    );
    const proposal = makeProposal({ ipfs: "bafyabc123" });
    const result = await fetchProposalOutcomeData(proposal);
    expect(result.approved?.description).toBe("Has XDR");
    expect(result.approved?.xdr).toBe("AAAAAH...");
  });

  it("reads the tree-shaped outcomes.json format", async () => {
    mockReadIpfs.mockResolvedValue(
      outcomesFile({
        outcomes: {
          approved: {
            description: "Approved tree",
            execution: {
              type: "contract",
              contract: {
                address: "C...tree-approved",
                execute_fn: "mint",
                args: [100],
              },
            },
          },
          rejected: {
            description: "Rejected tree",
            execution: {
              type: "xdr",
              xdr: "AAAAAX...",
            },
          },
          cancelled: {
            description: "Cancelled tree",
          },
        },
      }),
    );
    const approved = makeContract({
      address: "C...tree-approved",
      execute_fn: "mint",
    });
    const proposal = makeProposal({
      ipfs: "bafyabc123",
      outcome_contracts: [approved],
    });
    const result = await fetchProposalOutcomeData(proposal);

    expect(result.approved?.description).toBe("Approved tree");
    expect(result.approved?.contract?.address).toBe("C...tree-approved");
    expect(result.approved?.contract?.execute_fn).toBe("mint");
    expect(result.rejected?.description).toBe("Rejected tree");
    expect(result.rejected?.xdr).toBe("AAAAAX...");
    expect(result.cancelled?.description).toBe("Cancelled tree");
    expect(result.cancelled?.xdr).toBeUndefined();
  });

  it("shows no call that only outcomes.json names: it never runs", async () => {
    mockReadIpfs.mockResolvedValue(
      outcomesFile({
        outcomes: {
          approved: {
            description: "Off chain",
            execution: { type: "contract", contract: makeContract() },
          },
        },
      }),
    );
    const result = await fetchProposalOutcomeData(
      makeProposal({ ipfs: "bafyabc123" }),
    );
    expect(result.approved).toEqual({ description: "Off chain" });
  });
});

describe("normalizeOutcomeData", () => {
  it("returns an empty object for null/undefined input", () => {
    expect(normalizeOutcomeData(null)).toEqual({});
    expect(normalizeOutcomeData(undefined)).toEqual({});
    expect(normalizeOutcomeData("nope")).toEqual({});
  });

  it("normalizes the tree format into the flat display shape", () => {
    const normalized = normalizeOutcomeData({
      outcomes: {
        approved: {
          description: "Approved",
          execution: {
            type: "contract",
            contract: { address: "C1", execute_fn: "f", args: [] },
          },
        },
        rejected: {
          description: "Rejected",
          execution: { type: "xdr", xdr: "AAAA" },
        },
      },
    });

    expect(normalized).toEqual({
      approved: {
        description: "Approved",
        contract: { address: "C1", execute_fn: "f", args: [] },
      },
      rejected: { description: "Rejected", xdr: "AAAA" },
    });
  });

  it("normalizes the legacy flat format unchanged", () => {
    const normalized = normalizeOutcomeData({
      approved: { description: "Old approved", xdr: "BBBB" },
    });

    expect(normalized).toEqual({
      approved: { description: "Old approved", xdr: "BBBB" },
    });
  });
});

describe("fetchProposalFromIPFS", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches proposal markdown from IPFS and returns content", async () => {
    mockReadIpfs.mockResolvedValue("# My Proposal\n\nThis is a test.");
    const result = await fetchProposalFromIPFS("bafyabc123");
    expect(result).toBe("# My Proposal\n\nThis is a test.");
    expect(mockReadIpfs).toHaveBeenCalledWith("bafyabc123", "/proposal.md");
  });

  it("returns null when IPFS fetch fails", async () => {
    mockReadIpfs.mockResolvedValue(null);
    const result = await fetchProposalFromIPFS("bafyabc123");
    expect(result).toBeNull();
  });

  it("returns null when IPFS fetch throws", async () => {
    mockReadIpfs.mockRejectedValue(new Error("network error"));
    const result = await fetchProposalFromIPFS("bafyabc123");
    expect(result).toBeNull();
  });
});

describe("resolveDiscussionCid", () => {
  it("prefers an explicit discussionIpfs CID", () => {
    const proposal = makeProposal({
      ipfs: "bafyproposal",
      discussionIpfs: "bafydiscussion",
    });
    expect(resolveDiscussionCid(proposal)).toBe("bafydiscussion");
  });

  it("falls back to the proposal's own IPFS directory", () => {
    const proposal = makeProposal({ ipfs: "bafyproposal" });
    expect(resolveDiscussionCid(proposal)).toBe("bafyproposal");
  });

  it("returns null when neither CID is present", () => {
    const proposal = makeProposal({ ipfs: "" });
    expect(resolveDiscussionCid(proposal)).toBeNull();
  });
});

describe("fetchProposalDiscussionFromIPFS", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches proposal_discussion.md markdown and returns content", async () => {
    mockReadIpfs.mockResolvedValue("## Discussion\n\nAll good here.");
    const result = await fetchProposalDiscussionFromIPFS("bafyabc123");
    expect(mockReadIpfs).toHaveBeenCalledWith(
      "bafyabc123",
      "/proposal_discussion.md",
    );
    expect(result).toBe("## Discussion\n\nAll good here.");
  });

  it("returns null for empty/whitespace content", async () => {
    mockReadIpfs.mockResolvedValue("   ");
    expect(await fetchProposalDiscussionFromIPFS("bafyabc123")).toBeNull();
  });

  it("returns null when the file is missing", async () => {
    mockReadIpfs.mockResolvedValue(null);
    expect(await fetchProposalDiscussionFromIPFS("bafyabc123")).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    mockReadIpfs.mockRejectedValue(new Error("boom"));
    expect(await fetchProposalDiscussionFromIPFS("bafyabc123")).toBeNull();
  });
});

describe("fetchProposalDiscussionSummaryFromIPFS", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the summary text", async () => {
    mockReadIpfs.mockResolvedValue("## Summary\n![x](img.png)");
    const result = await fetchProposalDiscussionSummaryFromIPFS("bafyabc123");
    expect(mockReadIpfs).toHaveBeenCalledWith("bafyabc123", "/summary.md");
    expect(result).toBe("## Summary\n![x](img.png)");
  });

  it("returns null for empty/whitespace content", async () => {
    mockReadIpfs.mockResolvedValue("   ");
    expect(
      await fetchProposalDiscussionSummaryFromIPFS("bafyabc123"),
    ).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    mockReadIpfs.mockRejectedValue(new Error("net"));
    expect(
      await fetchProposalDiscussionSummaryFromIPFS("bafyabc123"),
    ).toBeNull();
  });
});
