import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFetchContractId = vi.fn();

vi.mock("@stellar/stellar-sdk", () => ({
  contract: {
    Client: {
      from: vi.fn(async () => ({
        fetch_contract_id: (...args: unknown[]) => mockFetchContractId(...args),
      })),
    },
  },
  Networks: {
    PUBLIC: "Public Global Stellar Network ; September 2015",
    TESTNET: "Test SDF Network ; September 2015",
  },
}));

import { getContractByName } from "../../../src/service/StellarRegistryService";

const TANSU_ADDRESS =
  "CDXINK2T3P46M4LWK35FVIXXHJ2XHAS4FOVCGVPJ63YV5OVTM24IY5BI";

describe("StellarRegistryService (on-chain exact match)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves a registered name to its on-chain address", async () => {
    mockFetchContractId.mockResolvedValue({
      result: { value: TANSU_ADDRESS },
    });

    await expect(getContractByName("tansu")).resolves.toEqual({
      contractName: "tansu",
      contractId: TANSU_ADDRESS,
    });

    expect(mockFetchContractId).toHaveBeenCalledWith({
      contract_name: "tansu",
    });
  });

  it("returns null for a name that is not registered (contract error)", async () => {
    mockFetchContractId.mockResolvedValue({
      result: { error: { message: "No such contract deployed" } },
    });

    await expect(getContractByName("definitely-not-real")).resolves.toBeNull();
  });

  it("does not call the contract when the name is blank", async () => {
    await expect(getContractByName("   ")).resolves.toBeNull();
    expect(mockFetchContractId).not.toHaveBeenCalled();
  });

  it("retries transient failures before surfacing the error", async () => {
    mockFetchContractId.mockRejectedValue(new Error("RPC hiccup"));

    await expect(getContractByName("tansu")).rejects.toThrow("RPC hiccup");

    // 1 initial attempt + 2 retries.
    expect(mockFetchContractId).toHaveBeenCalledTimes(3);
  });

  it("targets the requested network registry contract", async () => {
    mockFetchContractId.mockResolvedValue({
      result: { value: TANSU_ADDRESS },
    });

    const { REGISTRY_CONTRACT_IDS } =
      await import("../../../src/service/StellarRegistryService");
    const { contract } = await import("@stellar/stellar-sdk");

    await getContractByName("tansu", "mainnet");

    expect(contract.Client.from).toHaveBeenCalledWith(
      expect.objectContaining({
        contractId: REGISTRY_CONTRACT_IDS.mainnet,
        networkPassphrase: expect.stringContaining("Public"),
      }),
    );
  });
});
