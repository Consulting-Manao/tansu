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
 *
 * Client-side only: the dapp must stay fully static (no backend / SSR) and
 * the registry API sends no CORS headers, so the browser cannot call it
 * directly. The service therefore serves a bundled snapshot of the registry
 * (src/data/registryContracts.ts) immediately and, in the background, tries
 * to refresh it through a public CORS proxy. When the proxy is unreachable
 * the snapshot keeps the feature working; when it succeeds the in-memory
 * cache is updated with the freshest list.
 */

import { retryAsync } from "utils/retry";
import { REGISTRY_SNAPSHOT_CONTRACTS } from "data/registryContracts";

export const STELLAR_REGISTRY_API_BASE = "https://stellar.rgstry.xyz/api/v1";

/**
 * Public CORS proxy used for the best-effort live refresh. The registry does
 * not send CORS headers, so a plain browser fetch is impossible; this proxy
 * is the only network hop and is only ever used as a background refresh on
 * top of the bundled snapshot.
 */
export const STELLAR_REGISTRY_CORS_PROXY =
  "https://api.allorigins.win/raw?url=";

/**
 * Per-network indexer endpoints. The public registry currently indexes
 * mainnet deployments only; both networks point at the same indexer until a
 * testnet instance becomes available.
 */
export const STELLAR_REGISTRY_API_BASES: Record<RegistryNetwork, string> = {
  testnet: STELLAR_REGISTRY_API_BASE,
  mainnet: STELLAR_REGISTRY_API_BASE,
};

/** Upstream fetch attempts (1 + retries) before giving up on a 5xx. */
const REGISTRY_FETCH_RETRIES = 2;
const REGISTRY_FETCH_BACKOFF_MS = 150;

/** Hard timeout for the background refresh so it never stalls the UI. */
const REGISTRY_FETCH_TIMEOUT_MS = 8_000;

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

/** Best-effort background refresh; only one runs at a time. */
let refreshInFlight: Promise<void> | null = null;

/** Bundled snapshot mapped once at module load (the guaranteed baseline). */
const SNAPSHOT_CONTRACTS: RegistryContract[] = REGISTRY_SNAPSHOT_CONTRACTS.map(
  mapRawRegistryContract,
);

/** Clear the in-memory contracts cache (exposed for tests and forced refresh). */
export function invalidateRegistryCache(): void {
  contractsCache = null;
}

/**
 * Fetch a registry path through the public CORS proxy, retrying transient
 * failures (5xx and network errors) via the shared retryAsync util. A hard
 * timeout keeps the background refresh from ever stalling the UI.
 */
async function fetchRegistryViaProxy(
  path: string,
  network: RegistryNetwork,
): Promise<Response> {
  return retryAsync(
    async () => {
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(),
        REGISTRY_FETCH_TIMEOUT_MS,
      );

      try {
        const upstream = `${STELLAR_REGISTRY_API_BASES[network]}/${path}`;
        const response = await fetch(
          `${STELLAR_REGISTRY_CORS_PROXY}${encodeURIComponent(upstream)}`,
          { signal: controller.signal },
        );

        if (!response.ok && response.status >= 500) {
          throw new Error(
            `Stellar Registry request failed with status ${response.status}`,
          );
        }

        return response;
      } finally {
        clearTimeout(timer);
      }
    },
    REGISTRY_FETCH_RETRIES,
    REGISTRY_FETCH_BACKOFF_MS,
  );
}

/**
 * Fetch all registered contracts.
 *
 * Serves the bundled snapshot (or a still-fresh in-memory cache) immediately
 * so the UI never waits on the network, and kicks off a single best-effort
 * background refresh through the CORS proxy. When the refresh succeeds the
 * cache is replaced with the live list; when it fails the snapshot remains.
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

  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const response = await fetchRegistryViaProxy("contracts", network);
        if (!response.ok) return;

        const payload = (await response.json()) as {
          result?: RawRegistryContract[];
        };
        if (payload.result) {
          contractsCache = {
            contracts: payload.result.map(mapRawRegistryContract),
            fetchedAt: Date.now(),
          };
        }
      } catch {
        // Best-effort only: keep serving the snapshot.
      } finally {
        refreshInFlight = null;
      }
    })();
  }

  return contractsCache?.contracts ?? SNAPSHOT_CONTRACTS;
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
 *
 * Resolves client-side against the (cached/snapshot) list: the registry's
 * per-name endpoint returns no CORS headers and public CORS proxies choke on
 * its 404 responses, so a dedicated network call is both unnecessary and
 * unreliable. Returns null when the name is not registered.
 */
export async function getContractByName(
  name: string,
  network: RegistryNetwork = "mainnet",
): Promise<RegistryContract | null> {
  const trimmed = name.trim().toLowerCase();
  if (!trimmed) return null;

  const contracts = await listContracts(network);
  return (
    contracts.find(
      (contract) => contract.contractName.toLowerCase() === trimmed,
    ) ?? null
  );
}
