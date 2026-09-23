import * as Client from "../../packages/tansu";
import type { contract } from "@stellar/stellar-sdk";
import { assertEnv } from "../utils/envAssert";

assertEnv();

// Client options reach every call, so this is where method options go too.
const options: contract.ClientOptions &
  Pick<contract.MethodOptions, "useUpgradedAuth"> = {
  networkPassphrase: import.meta.env.PUBLIC_SOROBAN_NETWORK_PASSPHRASE,
  contractId: import.meta.env.PUBLIC_TANSU_CONTRACT_ID,
  rpcUrl: import.meta.env.PUBLIC_SOROBAN_RPC_URL,
  // Allow insecure HTTP connections only in development to prevent MITM attacks in production
  allowHttp: import.meta.env.DEV,
  // Legacy address credentials: wallets on an older stellar-base, like Nido's
  // sign page, cannot parse the v2 ones (CAP-71) the SDK records by default.
  useUpgradedAuth: false,
};

export default new Client.Client(options);
