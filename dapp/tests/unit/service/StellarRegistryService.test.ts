import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function createJsonResponse(body: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const REGISTRY_PROXY_CONTRACTS_ENDPOINT = "/api/registry/contracts";

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

  it("lists contracts and maps the raw snake_case payload to camelCase", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ result: RAW_CONTRACTS }));
    vi.stubGlobal("fetch", fetchMock);

    const { listContracts } = await loadService();

    await expect(listContracts()).resolves.toEqual([
      EXPECTED_TANSU,
      EXPECTED_USDC,
      {
        contractName: "router",
        contractId: "CAG5LRYQ5JVEUI5TEID72EYOVX44TTUJT5BQR2J6J77FH65PCCFAJDDH",
        channel: "soroswap",
        deployer: null,
        wasmName: "soroswap-router",
        wasmVersion: null,
        isStellarAssetContract: false,
      },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${REGISTRY_PROXY_CONTRACTS_ENDPOINT}?network=mainnet`,
    );
  });

  it("passes the requested network through to the proxy", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() => createJsonResponse({ result: RAW_CONTRACTS }));
    vi.stubGlobal("fetch", fetchMock);

    const { listContracts } = await loadService();

    await listContracts("testnet");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${REGISTRY_PROXY_CONTRACTS_ENDPOINT}?network=testnet`,
    );
  });

  it("caches the contracts list and only fetches once within the TTL", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ result: RAW_CONTRACTS }));
    vi.stubGlobal("fetch", fetchMock);

    const { listContracts } = await loadService();

    await listContracts();
    await listContracts();
    await listContracts();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refetches after the cache is invalidated", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() => createJsonResponse({ result: RAW_CONTRACTS }));
    vi.stubGlobal("fetch", fetchMock);

    const { listContracts, invalidateRegistryCache } = await loadService();

    await listContracts();
    invalidateRegistryCache();
    await listContracts();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("searches client-side, matching names case-insensitively", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ result: RAW_CONTRACTS }));
    vi.stubGlobal("fetch", fetchMock);

    const { searchContracts } = await loadService();

    await expect(searchContracts("TANSU")).resolves.toEqual([EXPECTED_TANSU]);
    await expect(searchContracts("tans")).resolves.toEqual([EXPECTED_TANSU]);
    await expect(searchContracts("  usdc  ")).resolves.toEqual([EXPECTED_USDC]);
  });

  it("matches wasm names and channels too, not only contract names", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ result: RAW_CONTRACTS }));
    vi.stubGlobal("fetch", fetchMock);

    const { searchContracts } = await loadService();

    const byWasm = await searchContracts("soroswap-router");
    expect(byWasm).toHaveLength(1);
    expect(byWasm[0]?.contractName).toBe("router");

    const byChannel = await searchContracts("circle");
    expect(byChannel).toHaveLength(1);
    expect(byChannel[0]?.contractName).toBe("usdc");
  });

  it("returns the whole list for an empty or blank query", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ result: RAW_CONTRACTS }));
    vi.stubGlobal("fetch", fetchMock);

    const { searchContracts } = await loadService();

    await expect(searchContracts("")).resolves.toHaveLength(3);
    await expect(searchContracts("   ")).resolves.toHaveLength(3);
  });

  it("propagates request failures so callers can show an error", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ error: "boom" }, 502));
    vi.stubGlobal("fetch", fetchMock);

    const { searchContracts } = await loadService();

    await expect(searchContracts("tansu")).rejects.toThrow(
      "Stellar Registry request failed with status 502",
    );

    // 5xx responses are retried (1 initial + 2 retries) before giving up.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("resolves a single contract by its exact name", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse(RAW_CONTRACTS[0]));
    vi.stubGlobal("fetch", fetchMock);

    const { getContractByName } = await loadService();

    await expect(getContractByName("tansu")).resolves.toEqual(EXPECTED_TANSU);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${REGISTRY_PROXY_CONTRACTS_ENDPOINT}/tansu?network=mainnet`,
    );
  });

  it("URL-encodes the contract name when resolving", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse(RAW_CONTRACTS[0]));
    vi.stubGlobal("fetch", fetchMock);

    const { getContractByName } = await loadService();

    await getContractByName("pool factory v2");

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${REGISTRY_PROXY_CONTRACTS_ENDPOINT}/pool%20factory%20v2?network=mainnet`,
    );
  });

  it("returns null for unregistered names (404)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ error: "not found" }, 404));
    vi.stubGlobal("fetch", fetchMock);

    const { getContractByName } = await loadService();

    await expect(getContractByName("nope")).resolves.toBeNull();
  });

  it("does not fetch when the name is blank", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { getContractByName } = await loadService();

    await expect(getContractByName("   ")).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
