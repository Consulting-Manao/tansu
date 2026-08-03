import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetchJsonFromIpfs = vi.fn();
const mockFetchTextFromIpfs = vi.fn();
const mockGetIpfsBasicLink = vi.fn();

vi.mock("../../../src/utils/ipfsFunctions", () => ({
  fetchJsonFromIpfs: (...args: unknown[]) => mockFetchJsonFromIpfs(...args),
  fetchTextFromIpfs: (...args: unknown[]) => mockFetchTextFromIpfs(...args),
  getIpfsBasicLink: (...args: unknown[]) => mockGetIpfsBasicLink(...args),
}));

import {
  fetchProposalOutcomeData,
  fetchProposalFromIPFS,
  fetchProposalDiscussionFromIPFS,
  fetchProposalDiscussionSummaryFromIPFS,
  resolveDiscussionCid,
} from "../../../src/service/ProposalService";
import type { Proposal, OutcomeContract } from "../../../src/types/proposal";

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
    expect(mockFetchJsonFromIpfs).not.toHaveBeenCalled();
  });

  it("loads IPFS outcome data as the base when IPFS CID is provided", async () => {
    mockFetchJsonFromIpfs.mockResolvedValue({
      approved: {
        description: "Approved from IPFS",
      },
    });

    const proposal = makeProposal({ ipfs: "bafyabc123" });
    const result = await fetchProposalOutcomeData(proposal);

    expect(result.approved?.description).toBe("Approved from IPFS");
    expect(mockFetchJsonFromIpfs).toHaveBeenCalledWith(
      "bafyabc123",
      "/outcomes.json",
    );
  });

  it("merges contract outcome data on top of IPFS data", async () => {
    mockFetchJsonFromIpfs.mockResolvedValue({
      approved: {
        description: "IPFS description",
      },
      rejected: {
        description: "IPFS rejected description",
      },
    });

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
    mockFetchJsonFromIpfs.mockResolvedValue({
      rejected: { description: "Has IPFS" },
    });

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
    mockFetchJsonFromIpfs.mockResolvedValue({});
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
    mockFetchJsonFromIpfs.mockResolvedValue({});
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

  it("skips outcome_contracts with null/empty address", async () => {
    mockFetchJsonFromIpfs.mockResolvedValue({});
    const proposal = makeProposal({
      ipfs: "",
      outcome_contracts: [
        null as any,
        { address: "", execute_fn: "", args: [] },
        undefined as any,
      ] as any,
    });

    const result = await fetchProposalOutcomeData(proposal);
    expect(result.approved).toBeUndefined();
    expect(result.rejected).toBeUndefined();
    expect(result.cancelled).toBeUndefined();
  });

  it("IPFS fetch failure does not block contract data", async () => {
    mockFetchJsonFromIpfs.mockRejectedValue(new Error("IPFS timeout"));
    const approvedContract = makeContract({ address: "C...still-works" });

    const proposal = makeProposal({
      ipfs: "bafyabc123",
      outcome_contracts: [approvedContract, null as any, null as any],
    });

    const result = await fetchProposalOutcomeData(proposal);
    expect(mockFetchJsonFromIpfs).toHaveBeenCalled();
    expect(result.approved?.contract?.address).toBe("C...still-works");
    expect(result.approved?.description).toBe("Contract execution: transfer");
  });

  it("handles proposals with no outcome_contracts field", async () => {
    mockFetchJsonFromIpfs.mockResolvedValue({
      approved: { description: "IPFS only" },
    });
    const proposal = makeProposal({ ipfs: "bafyabc123" });
    delete (proposal as any).outcome_contracts;
    const result = await fetchProposalOutcomeData(proposal);
    expect(result.approved?.description).toBe("IPFS only");
    expect(result.approved?.contract).toBeUndefined();
  });

  it("preserves IPFS XDR data when no contract overrides it", async () => {
    mockFetchJsonFromIpfs.mockResolvedValue({
      approved: {
        description: "Has XDR",
        xdr: "AAAAAH...",
      },
    });
    const proposal = makeProposal({ ipfs: "bafyabc123" });
    const result = await fetchProposalOutcomeData(proposal);
    expect(result.approved?.description).toBe("Has XDR");
    expect(result.approved?.xdr).toBe("AAAAAH...");
  });
});

describe("fetchProposalFromIPFS", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches proposal markdown from IPFS and returns content", async () => {
    mockFetchTextFromIpfs.mockResolvedValue("# My Proposal\n\nThis is a test.");
    mockGetIpfsBasicLink.mockReturnValue(
      "https://ipfs.filebase.io/ipfs/bafyabc123",
    );
    const result = await fetchProposalFromIPFS("bafyabc123");
    expect(result).toBe("# My Proposal\n\nThis is a test.");
    expect(mockFetchTextFromIpfs).toHaveBeenCalledWith(
      "bafyabc123",
      "/proposal.md",
    );
  });

  it("rewrites relative image paths to absolute IPFS paths", async () => {
    mockFetchTextFromIpfs.mockResolvedValue(
      "![logo](images/logo.png) and ![screenshot](./screenshots/1.png)",
    );
    mockGetIpfsBasicLink.mockReturnValue(
      "https://ipfs.filebase.io/ipfs/bafyabc123",
    );
    const result = await fetchProposalFromIPFS("bafyabc123");
    expect(result).toBe(
      "![logo](https://ipfs.filebase.io/ipfs/bafyabc123/images/logo.png) and ![screenshot](https://ipfs.filebase.io/ipfs/bafyabc123/./screenshots/1.png)",
    );
  });

  it("does not rewrite absolute image paths", async () => {
    mockFetchTextFromIpfs.mockResolvedValue(
      "![external](https://example.com/image.png)",
    );
    mockGetIpfsBasicLink.mockReturnValue(
      "https://ipfs.filebase.io/ipfs/bafyabc123",
    );
    const result = await fetchProposalFromIPFS("bafyabc123");
    expect(result).toBe("![external](https://example.com/image.png)");
  });

  it("returns null when IPFS fetch fails", async () => {
    mockFetchTextFromIpfs.mockResolvedValue(null);
    mockGetIpfsBasicLink.mockReturnValue(
      "https://ipfs.filebase.io/ipfs/bafyabc123",
    );
    const result = await fetchProposalFromIPFS("bafyabc123");
    expect(result).toBeNull();
  });

  it("returns content unchanged when getIpfsBasicLink returns empty", async () => {
    mockFetchTextFromIpfs.mockResolvedValue("![img](path.png)");
    mockGetIpfsBasicLink.mockReturnValue("");
    const result = await fetchProposalFromIPFS("bafyabc123");
    expect(result).toBe("![img](path.png)");
  });

  it("returns null when IPFS fetch throws", async () => {
    mockFetchTextFromIpfs.mockRejectedValue(new Error("network error"));
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
    mockFetchTextFromIpfs.mockResolvedValue("## Discussion\n\nAll good here.");
    mockGetIpfsBasicLink.mockReturnValue(
      "https://ipfs.filebase.io/ipfs/bafyabc123",
    );
    const result = await fetchProposalDiscussionFromIPFS("bafyabc123");
    expect(mockFetchTextFromIpfs).toHaveBeenCalledWith(
      "bafyabc123",
      "/proposal_discussion.md",
    );
    expect(result).toBe("## Discussion\n\nAll good here.");
  });

  it("rewrites relative image paths to absolute IPFS paths", async () => {
    mockFetchTextFromIpfs.mockResolvedValue("![diagram](images/flow.png)");
    mockGetIpfsBasicLink.mockReturnValue(
      "https://ipfs.filebase.io/ipfs/bafyabc123",
    );
    const result = await fetchProposalDiscussionFromIPFS("bafyabc123");
    expect(result).toBe(
      "![diagram](https://ipfs.filebase.io/ipfs/bafyabc123/images/flow.png)",
    );
  });

  it("returns null for empty/whitespace content", async () => {
    mockFetchTextFromIpfs.mockResolvedValue("   ");
    expect(await fetchProposalDiscussionFromIPFS("bafyabc123")).toBeNull();
  });

  it("returns null when the file is missing", async () => {
    mockFetchTextFromIpfs.mockResolvedValue(null);
    expect(await fetchProposalDiscussionFromIPFS("bafyabc123")).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    mockFetchTextFromIpfs.mockRejectedValue(new Error("boom"));
    expect(await fetchProposalDiscussionFromIPFS("bafyabc123")).toBeNull();
  });
});

describe("fetchProposalDiscussionSummaryFromIPFS", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns summary text and rewrites relative images", async () => {
    mockFetchTextFromIpfs.mockResolvedValue("## Summary\n![x](img.png)");
    mockGetIpfsBasicLink.mockReturnValue(
      "https://ipfs.filebase.io/ipfs/bafyabc123",
    );
    const result = await fetchProposalDiscussionSummaryFromIPFS("bafyabc123");
    expect(mockFetchTextFromIpfs).toHaveBeenCalledWith(
      "bafyabc123",
      "/summary.md",
    );
    expect(result).toBe(
      "## Summary\n![x](https://ipfs.filebase.io/ipfs/bafyabc123/img.png)",
    );
  });

  it("returns null for empty/whitespace content", async () => {
    mockFetchTextFromIpfs.mockResolvedValue("   ");
    expect(
      await fetchProposalDiscussionSummaryFromIPFS("bafyabc123"),
    ).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    mockFetchTextFromIpfs.mockRejectedValue(new Error("net"));
    expect(
      await fetchProposalDiscussionSummaryFromIPFS("bafyabc123"),
    ).toBeNull();
  });
});
