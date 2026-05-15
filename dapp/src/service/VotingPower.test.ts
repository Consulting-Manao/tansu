import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetProposal = vi.fn();
const mockGetMaxWeight = vi.fn();
const mockGetTokenBalance = vi.fn();

vi.mock("../contracts/soroban_tansu", () => ({
  default: {
    options: {
      publicKey: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
    },
    get_proposal: (...args: unknown[]) => mockGetProposal(...args),
    get_max_weight: (...args: unknown[]) => mockGetMaxWeight(...args),
  },
}));

vi.mock("./walletService", () => ({
  loadedPublicKey: () =>
    "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
}));

vi.mock("./StateService", () => ({
  loadedProjectId: vi.fn(),
}));

vi.mock("./TxService", () => ({
  signAndSend: vi.fn(),
}));

vi.mock("./ReadContractService", () => ({
  invalidateProposalCache: vi.fn(),
}));

vi.mock("../utils/crypto", () => ({
  encryptWithPublicKey: vi.fn(),
}));

vi.mock("../utils/errorHandler", () => ({
  handleFreighterError: vi.fn(),
}));

vi.mock("./TokenBalanceService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./TokenBalanceService")>();
  return {
    ...actual,
    getTokenBalance: (...args: unknown[]) => mockGetTokenBalance(...args),
  };
});

import { getVotingPower } from "./ContractService";

describe("getVotingPower", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses token balance when proposal has token_contract", async () => {
    const tokenAddr =
      "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";
    mockGetProposal.mockResolvedValue({
      result: {
        vote_data: { token_contract: { tag: "Some", values: [tokenAddr] } },
      },
    });
    mockGetTokenBalance.mockResolvedValue({
      balanceInTokens: 5000,
      maxVoteWeight: 5000,
      decimals: 7,
    });

    const result = await getVotingPower("myproject", 1);

    expect(result).toEqual({
      maxWeight: 5000,
      isTokenVoting: true,
      tokenContract: tokenAddr,
      tokenBalance: 5000,
      tokenDecimals: 7,
    });
    expect(mockGetTokenBalance).toHaveBeenCalledWith(
      tokenAddr,
      "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
    );
    expect(mockGetMaxWeight).not.toHaveBeenCalled();
  });

  it("uses get_max_weight for badge proposals", async () => {
    mockGetProposal.mockResolvedValue({
      result: { vote_data: { token_contract: null } },
    });
    mockGetMaxWeight.mockResolvedValue({ result: 11 });

    const result = await getVotingPower("myproject", 2);

    expect(result).toEqual({
      maxWeight: 11,
      isTokenVoting: false,
      tokenContract: null,
    });
    expect(mockGetTokenBalance).not.toHaveBeenCalled();
    expect(mockGetMaxWeight).toHaveBeenCalled();
  });
});
