import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function createJsonResponse(body: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const UPSTREAM_CONTRACTS_URL = "https://stellar.rgstry.xyz/api/v1/contracts";
const CORS_PROXY_URL = `https://api.allorigins.win/raw?url=${encodeURIComponent(
  UPSTREAM_CONTRACTS_URL,
)}`;

const RAW_CONTRACTS = [
  {
    channel: "root",
    contract_id: "CDXINK2T3P46M4LWK35FVIXXHJ2XHAS4FOVCGVPJ63YV5OVTM24IY5BI",
    contract_name: "tansu",
    deployer: null,
    wasm_version: "2.0.2",
    wasm_name: "tansu",
    wasm_channel: "root",
    is_stellar_asset_contract: false,
  },
  {
    channel: "circle",
    contract_id: "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75",
    contract_name: "usdc",
    deployer: null,
    wasm_version: null,
    wasm_name: null,
    wasm_channel: null,
    is_stellar_asset_contract: true,
  },
  {
    channel: "soroswap",
    contract_id: "CAG5LRYQ5JVEUI5TEID72EYOVX44TTUJT5BQR2J6J77FH65PCCFAJDDH",
    contract_name: "router",
    deployer: null,
    wasm_version: null,
    wasm_name: "soroswap-router",
    wasm_channel: "root",
    is_stellar_asset_contract: false,
  },
];

const EXPECTED_TANSU = {
  contractName: "tansu",
  contractId: "CDXINK2T3P46M4LWK35FVIXXHJ2XHAS4FOVCGVPJ63YV5OVTM24IY5BI",
  channel: "root",
  deployer: null,
  wasmName: "tansu",
  wasmVersion: "2.0.2",
  isStellarAssetContract: false,
};

const EXPECTED_USDC = {
  contractName: "usdc",
  contractId: "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75",
  channel: "circle",
  deployer: null,
  wasmName: null,
  wasmVersion: null,
  isStellarAssetContract: true,
};

async function loadService() {
  return import("../../../src/service/StellarRegistryService");
}

describe("StellarRegistryService", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("maps the raw snake_case payload to camelCase", async () => {
    const { mapRawRegistryContract } = await loadService();
    expect(mapRawRegistryContract(RAW_CONTRACTS[0]!)).toEqual(EXPECTED_TANSU);
    expect(mapRawRegistryContract(RAW_CONTRACTS[1]!)).toEqual(EXPECTED_USDC);
  });

  it("serves the bundled snapshot when the registry is unreachable", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    const { listContracts } = await loadService();
    const contracts = await listContracts();

    // The snapshot mirrors the mainnet indexer: 200 contracts, tansu included.
    expect(contracts.length).toBe(200);
    expect(contracts.some((c) => c.contractName === "tansu")).toBe(true);

    // The best-effort refresh still went through the CORS proxy.
    expect(fetchMock).toHaveBeenCalled();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(CORS_PROXY_URL);
    expect(fetchMock.mock.calls[0]?.[1]).toHaveProperty("signal");
  });

  it("refreshes the snapshot with the live list through the CORS proxy", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ result: RAW_CONTRACTS }));
    vi.stubGlobal("fetch", fetchMock);

    const { listContracts } = await loadService();

    // First call returns the snapshot immediately (no network wait).
    const first = await listContracts();
    expect(first.length).toBe(200);

    // Once the background refresh lands, the cache serves the live list.
    await vi.waitFor(
      async () => {
        const refreshed = await listContracts();
        expect(refreshed).toEqual([
          EXPECTED_TANSU,
          EXPECTED_USDC,
          {
            contractName: "router",
            contractId:
              "CAG5LRYQ5JVEUI5TEID72EYOVX44TTUJT5BQR2J6J77FH65PCCFAJDDH",
            channel: "soroswap",
            deployer: null,
            wasmName: "soroswap-router",
            wasmVersion: null,
            isStellarAssetContract: false,
          },
        ]);
      },
      { timeout: 2000 },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(CORS_PROXY_URL);
  });

  it("does not re-fetch while the cache is still fresh", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ result: RAW_CONTRACTS }));
    vi.stubGlobal("fetch", fetchMock);

    const { listContracts } = await loadService();

    await listContracts();
    await vi.waitFor(
      async () => {
        const refreshed = await listContracts();
        expect(refreshed).toHaveLength(3);
      },
      { timeout: 2000 },
    );

    const callsAfterRefresh = fetchMock.mock.calls.length;
    await listContracts();
    expect(fetchMock.mock.calls.length).toBe(callsAfterRefresh);
  });

  it("searches contract names case-insensitively and trims the query", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);

    const { searchContracts } = await loadService();

    await expect(searchContracts("TANSU")).resolves.toEqual([EXPECTED_TANSU]);
    await expect(searchContracts("tans")).resolves.toEqual([EXPECTED_TANSU]);

    // "usdc" is a substring of several registered names (usdc-vault, abusdc,
    // yusdc, ...) so the search returns all of them, usdc itself included.
    const usdcMatches = await searchContracts("  usdc  ");
    expect(usdcMatches).toContainEqual(EXPECTED_USDC);
    expect(usdcMatches.length).toBeGreaterThan(1);
  });

  it("matches wasm names and channels too, not only contract names", async () => {
    const { filterContracts } = await loadService();

    const byWasm = filterContracts(
      RAW_CONTRACTS.map((raw) => ({
        contractName: raw.contract_name,
        contractId: raw.contract_id,
        channel: raw.channel,
        deployer: raw.deployer,
        wasmName: raw.wasm_name,
        wasmVersion: raw.wasm_version,
        isStellarAssetContract: raw.is_stellar_asset_contract,
      })),
      "soroswap-router",
    );
    expect(byWasm).toHaveLength(1);
    expect(byWasm[0]?.contractName).toBe("router");

    const byChannel = filterContracts(
      RAW_CONTRACTS.map((raw) => ({
        contractName: raw.contract_name,
        contractId: raw.contract_id,
        channel: raw.channel,
        deployer: raw.deployer,
        wasmName: raw.wasm_name,
        wasmVersion: raw.wasm_version,
        isStellarAssetContract: raw.is_stellar_asset_contract,
      })),
      "circle",
    );
    expect(byChannel).toHaveLength(1);
    expect(byChannel[0]?.contractName).toBe("usdc");
  });

  it("returns the whole list for an empty or blank query", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);

    const { searchContracts } = await loadService();

    await expect(searchContracts("")).resolves.toHaveLength(200);
    await expect(searchContracts("   ")).resolves.toHaveLength(200);
  });

  it("resolves a single contract by its exact registered name", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);

    const { getContractByName } = await loadService();

    await expect(getContractByName("tansu")).resolves.toEqual(EXPECTED_TANSU);
    await expect(getContractByName("TANSU")).resolves.toEqual(EXPECTED_TANSU);
  });

  it("returns null for unregistered names", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);

    const { getContractByName } = await loadService();

    await expect(getContractByName("nope")).resolves.toBeNull();
  });

  it("does not fetch when the name is blank", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);

    const { getContractByName } = await loadService();

    await expect(getContractByName("   ")).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
