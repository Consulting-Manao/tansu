/**
 * Stellar Registry service.
 *
 * Wraps the Stellar Registry indexer API (https://stellar.rgstry.xyz) which
 * resolves registered contract names to on-chain contract addresses.
 *
 * This service is intentionally isolated from any UI so it can be reused by
 * other features (e.g. contract search anywhere in the dapp) in the future.
 *
 * API docs: GET /api/v1 returns the endpoint index.
 *  - GET /api/v1/contracts            -> { result: RawRegistryContract[] }
 *  - GET /api/v1/contracts/{name}     -> RawRegistryContract (with versions)
 *
 * NOTE: The indexer currently serves MAINNET deployments. The `network`
 * parameter is kept in the public API so a testnet indexer can be slotted
 * in later without changing call sites.
 */

import { retryAsync } from "utils/retry";

export const STELLAR_REGISTRY_API_BASE = "https://stellar.rgstry.xyz/api/v1";

/**
 * Per-network indexer endpoints. The public registry currently indexes
 * mainnet deployments only; both networks point at the same indexer until a
 * testnet instance becomes available.
 */
export const STELLAR_REGISTRY_API_BASES: Record<RegistryNetwork, string> = {
  testnet: STELLAR_REGISTRY_API_BASE,
  mainnet: STELLAR_REGISTRY_API_BASE,
};

/**
 * Same-origin proxy exposing the registry to the browser. The registry does
 * not send CORS headers, so clients must not call it cross-origin; the
 * /api/registry Astro endpoint forwards whitelisted paths upstream.
 */
export const REGISTRY_PROXY_BASE = "/api/registry";

/** Upstream fetch attempts (1 + retries) before giving up on a 5xx. */
const REGISTRY_FETCH_RETRIES = 2;
const REGISTRY_FETCH_BACKOFF_MS = 150;

/** Cache lifetime for the contracts list, in milliseconds. */
export const REGISTRY_CACHE_TTL_MS = 30_000;

/** Raw contract entry as returned by the Registry Indexer API (snake_case). */
export interface RawRegistryContract {
  channel: string;
  contract_id: string;
  contract_name: string;
  deployer: string | null;
  wasm_version: string | null;
  wasm_name: string | null;
  wasm_channel: string | null;
  is_stellar_asset_contract: boolean;
}

/** Normalized (camelCase) contract entry used across the app. */
export interface RegistryContract {
  contractName: string;
  contractId: string;
  channel: string;
  deployer: string | null;
  wasmName: string | null;
  wasmVersion: string | null;
  isStellarAssetContract: boolean;
}

export type RegistryNetwork = "testnet" | "mainnet";

export function mapRawRegistryContract(
  raw: RawRegistryContract,
): RegistryContract {
  return {
    contractName: raw.contract_name,
    contractId: raw.contract_id,
    channel: raw.channel,
    deployer: raw.deployer,
    wasmName: raw.wasm_name,
    wasmVersion: raw.wasm_version,
    isStellarAssetContract: raw.is_stellar_asset_contract,
  };
}

let contractsCache: {
  contracts: RegistryContract[];
  fetchedAt: number;
} | null = null;

/** Clear the in-memory contracts cache (exposed for tests and forced refresh). */
export function invalidateRegistryCache(): void {
  contractsCache = null;
}

/**
 * Fetch a registry path through the same-origin proxy, retrying transient
 * upstream failures (5xx) via the shared retryAsync util. Client errors
 * (4xx, e.g. unknown contract name) are returned without retrying so
 * callers can handle them precisely.
 */
async function fetchRegistry(
  path: string,
  network: RegistryNetwork,
): Promise<Response> {
  return retryAsync(
    async () => {
      const response = await fetch(
        `${REGISTRY_PROXY_BASE}/${path}?network=${network}`,
      );

      if (!response.ok && response.status >= 500) {
        throw new Error(
          `Stellar Registry request failed with status ${response.status}`,
        );
      }

      return response;
    },
    REGISTRY_FETCH_RETRIES,
    REGISTRY_FETCH_BACKOFF_MS,
  );
}

/**
 * Fetch all registered contracts. Results are cached in memory for
 * REGISTRY_CACHE_TTL_MS to avoid hammering the indexer on every keystroke.
 */
export async function listContracts(
  network: RegistryNetwork = "mainnet",
): Promise<RegistryContract[]> {
  if (
    contractsCache &&
    Date.now() - contractsCache.fetchedAt < REGISTRY_CACHE_TTL_MS
  ) {
    return contractsCache.contracts;
  }

  const response = await fetchRegistry("contracts", network);

  if (!response.ok) {
    throw new Error(
      `Stellar Registry request failed with status ${response.status}`,
    );
  }

  const payload = (await response.json()) as { result?: RawRegistryContract[] };
  const contracts = (payload.result ?? []).map(mapRawRegistryContract);

  contractsCache = { contracts, fetchedAt: Date.now() };
  return contracts;
}

/**
 * Client-side case-insensitive search over registered contracts.
 * Matches against the contract name, the WASM name, and the channel.
 */
export function filterContracts(
  contracts: RegistryContract[],
  query: string,
): RegistryContract[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return contracts;

  return contracts.filter((contract) => {
    return (
      contract.contractName.toLowerCase().includes(normalized) ||
      (contract.wasmName?.toLowerCase().includes(normalized) ?? false) ||
      contract.channel.toLowerCase().includes(normalized)
    );
  });
}

/**
 * Search registered contracts by name. Delegates to listContracts() (cached)
 * and filters client-side — the indexer API does not support server-side
 * search parameters.
 */
export async function searchContracts(
  query: string,
  network: RegistryNetwork = "mainnet",
): Promise<RegistryContract[]> {
  const contracts = await listContracts(network);
  return filterContracts(contracts, query);
}

/**
 * Resolve a single contract by its exact registered name.
 * Returns null when the name is not registered (API 404).
 */
export async function getContractByName(
  name: string,
  network: RegistryNetwork = "mainnet",
): Promise<RegistryContract | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const response = await fetchRegistry(
    `contracts/${encodeURIComponent(trimmed)}`,
    network,
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(
      `Stellar Registry request failed with status ${response.status}`,
    );
  }

  const payload = (await response.json()) as RawRegistryContract;
  return mapRawRegistryContract(payload);
}
