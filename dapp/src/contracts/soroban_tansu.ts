import * as Client from "../../packages/tansu";
import { StrKey, rpc, type contract } from "@stellar/stellar-sdk";
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

/** For reads: without a source account, a call does not load one first. */
export const tansuReads = new Client.Client(options);

/** The Soroban RPC every read, simulation and send goes through. */
export const rpcServer = new rpc.Server(
  import.meta.env.PUBLIC_SOROBAN_RPC_URL,
  {
    allowHttp: import.meta.env.DEV,
  },
);

/**
 * The account a transaction for `address` is built from. A smart account
 * (C...) cannot source a transaction: its wallet relays it and the relayer
 * becomes the source, so any existing account serves to build and simulate
 * it.
 */
export function sourceAccountFor(address: string): string {
  return StrKey.isValidContract(address)
    ? import.meta.env.PUBLIC_TANSU_OWNER_ID
    : address;
}

/** For calls the wallet at `address` signs. */
export function tansuFor(address: string): Client.Client {
  return new Client.Client({
    ...options,
    publicKey: sourceAccountFor(address),
  });
}
