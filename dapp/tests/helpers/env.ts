import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

type Env = Record<
  | "PUBLIC_SOROBAN_NETWORK_PASSPHRASE"
  | "PUBLIC_SOROBAN_RPC_URL"
  | "PUBLIC_STELLAR_REGISTRY_CONTRACT_ID"
  | "PUBLIC_HORIZON_URL"
  | "PUBLIC_TANSU_CONTRACT_ID"
  | "PUBLIC_TANSU_OWNER_ID"
  | "PUBLIC_DELEGATION_API_URL",
  string
>;

/**
 * What the app is built with for e2e: the documented contract ids, and hosts
 * that never resolve, so a request no test mocks fails instead of reaching a
 * real network.
 */
export const E2E_ENV: Env = {
  ...(parseEnv(
    readFileSync(new URL("../../.env.example", import.meta.url), "utf8"),
  ) as Env),
  PUBLIC_SOROBAN_RPC_URL: "https://rpc.e2e.test",
  PUBLIC_HORIZON_URL: "https://horizon.e2e.test",
  PUBLIC_DELEGATION_API_URL: "https://ipfs.e2e.test/",
};

export const E2E_PORT = 4329;
