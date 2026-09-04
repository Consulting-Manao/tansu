/**
 * Stellar Registry service.
 *
 * Resolves registered contract names to on-chain contract addresses by
 * calling the Stellar Registry smart contract DIRECTLY over Soroban RPC —
 * no backend, no SSR, no snapshot: the dapp must stay fully static.
 *
 * The lookup is an exact match (the on-chain registry only supports exact
 * name queries, e.g. `fetch_contract_id(name) -> address`). The registry
 * deployment currently indexed by the public registry is mainnet, so this
 * service deliberately uses the verified mainnet RPC and registry contract.
 *
 * Registry project: https://stellar.rgstry.xyz
 */

import * as StellarSdk from "@stellar/stellar-sdk";
import { retryAsync } from "utils/retry";

const REGISTRY_CONTRACT_ID =
  "CDU4M3LDIOUJJ5F3YXKJ4EJEP5VPRPG6N2LJ5HOQIMN7MNGL3NS3EGUY";
const REGISTRY_RPC_URL = "https://mainnet.sorobanrpc.com";

/** Registry website (shown in the UI as a link next to the not-found state). */
export const STELLAR_REGISTRY_URL = "https://stellar.rgstry.xyz";

/** Upstream RPC attempts (1 + retries) before giving up. */
const REGISTRY_RPC_RETRIES = 2;
const REGISTRY_RPC_BACKOFF_MS = 150;

/** A contract resolved from the Registry by its exact registered name. */
export interface RegistryContract {
  contractName: string;
  contractId: string;
}

/**
 * Resolve a single contract by its exact registered name via the Registry
 * contract. Returns null when the name is not registered.
 */
export async function getContractByName(
  name: string,
): Promise<RegistryContract | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  return retryAsync(
    () => fetchContractId(trimmed),
    REGISTRY_RPC_RETRIES,
    REGISTRY_RPC_BACKOFF_MS,
  );
}

/**
 * Invoke the registry contract's `fetch_contract_id` read-only method and
 * map its Result into a resolved contract or null (not registered).
 */
async function fetchContractId(
  contractName: string,
): Promise<RegistryContract | null> {
  // The SDK generates snake_case methods matching the contract interface at
  // runtime, but its TypeScript types only declare camelCase — hence the cast.
  const client = (await StellarSdk.contract.Client.from({
    contractId: REGISTRY_CONTRACT_ID,
    rpcUrl: REGISTRY_RPC_URL,
    networkPassphrase: StellarSdk.Networks.PUBLIC,
  })) as unknown as {
    fetch_contract_id(args: { contract_name: string }): Promise<unknown>;
  };

  const response = await client.fetch_contract_id({
    contract_name: contractName,
  });

  if (!response) {
    throw new Error("Stellar Registry request failed");
  }

  // The SDK parses the contract's Result<T, E> into { value } / { error }.
  const result = (
    response as {
      result?: { value?: unknown; error?: { message?: string } };
    }
  ).result;

  if (result?.error !== undefined && result.error !== null) {
    // Contract-level miss ("No such contract deployed") → not registered.
    return null;
  }

  const address = result?.value;
  if (typeof address !== "string" || !address) {
    throw new Error("Stellar Registry returned an unexpected result");
  }

  return { contractName, contractId: address };
}
