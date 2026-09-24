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
 * What the app is built with for e2e: the documented testnet configuration,
 * so flows run against the real contract, RPC, Horizon and upload worker.
 */
export const E2E_ENV = parseEnv(
  readFileSync(new URL("../../.env.example", import.meta.url), "utf8"),
) as Env;

// The dev server port: the upload worker only answers these origins.
export const E2E_PORT = 4321;
