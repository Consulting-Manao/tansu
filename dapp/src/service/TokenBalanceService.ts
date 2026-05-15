import * as StellarSdk from "@stellar/stellar-sdk";
import {
  checkSimulationError,
  parseContractError,
} from "../utils/contractErrors";
import { MAX_VOTE_WEIGHT_U32 } from "../utils/utils";

/** Soroban contract IDs used for SAC / SEP-41 tokens. */
export const SOROBAN_CONTRACT_ID_REGEX = /^C[A-Z0-9]{55}$/;

const U32_MAX = BigInt(MAX_VOTE_WEIGHT_U32);
const NULL_ACCOUNT = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const DEFAULT_TOKEN_DECIMALS = 7;

type TokenClient = StellarSdk.contract.Client & {
  spec: StellarSdk.contract.Spec;
  balance?: (
    args: Record<string, string>,
    options?: StellarSdk.contract.MethodOptions,
  ) => Promise<StellarSdk.contract.AssembledTransaction<unknown>>;
  decimals?: (
    options?: StellarSdk.contract.MethodOptions,
  ) => Promise<StellarSdk.contract.AssembledTransaction<unknown>>;
};

export type TokenBalanceInfo = {
  /** Balance in whole token units (1 = 1 token, not stroops). */
  balanceInTokens: number;
  /** Max vote weight in whole token units for the slider. */
  maxVoteWeight: number;
  decimals: number;
};

export function tokenScale(decimals: number): bigint {
  const safe = Math.max(0, Math.min(decimals, 18));
  return 10n ** BigInt(safe);
}

/** Stroops/smallest-unit → whole tokens (floor). */
export function stroopsToTokenUnits(stroops: bigint, decimals: number): bigint {
  const scale = tokenScale(decimals);
  if (scale <= 0n) return 0n;
  return stroops / scale;
}

/** Whole tokens → stroops/smallest-unit for on-chain transfer. */
export function tokenUnitsToStroops(tokens: bigint, decimals: number): bigint {
  return tokens * tokenScale(decimals);
}

/**
 * Max votable weight in whole token units (matches on-chain u32 weight).
 */
export function toMaxVoteWeightInTokens(
  balanceStroops: bigint,
  decimals: number,
): number {
  if (balanceStroops <= 0n) return 0;

  const balanceTokens = stroopsToTokenUnits(balanceStroops, decimals);
  const cap = U32_MAX;
  const votable = balanceTokens > cap ? cap : balanceTokens;

  if (votable <= 0n) return 0;
  if (votable > BigInt(Number.MAX_SAFE_INTEGER)) return 0;
  return Number(votable);
}

/** On-chain vote weight is whole token units (contract scales transfer by decimals). */
export function tokenVoteWeightToContract(weightInTokens: number): number {
  if (!Number.isFinite(weightInTokens) || weightInTokens <= 0) return 0;
  const w = Math.floor(weightInTokens);
  return Math.min(w, MAX_VOTE_WEIGHT_U32);
}

function getRpcClientOptions(
  contractId: string,
): StellarSdk.contract.ClientOptions {
  return {
    contractId,
    rpcUrl: import.meta.env.PUBLIC_SOROBAN_RPC_URL,
    networkPassphrase: import.meta.env.PUBLIC_SOROBAN_NETWORK_PASSPHRASE,
    allowHttp: import.meta.env.DEV,
  };
}

function scValToBigIntSafe(retval: StellarSdk.xdr.ScVal | undefined): bigint {
  if (!retval) return 0n;
  try {
    const value = StellarSdk.scValToBigInt(retval);
    if (value < 0n) return 0n;
    return value;
  } catch {
    return 0n;
  }
}

function u32FromSimulation(
  assembled: StellarSdk.contract.AssembledTransaction<unknown>,
): number {
  const simulation = assembled.simulation;
  if (simulation && StellarSdk.rpc.Api.isSimulationError(simulation)) {
    throw new Error(simulation.error ?? "Token contract simulation failed");
  }
  const retval = simulation?.result?.retval;
  if (!retval) return DEFAULT_TOKEN_DECIMALS;
  try {
    const asNumber = Number(StellarSdk.scValToBigInt(retval));
    if (!Number.isFinite(asNumber) || asNumber < 0 || asNumber > 18) {
      return DEFAULT_TOKEN_DECIMALS;
    }
    return Math.floor(asNumber);
  } catch {
    return DEFAULT_TOKEN_DECIMALS;
  }
}

function balanceFromSimulation(
  assembled: StellarSdk.contract.AssembledTransaction<unknown>,
): bigint {
  const simulation = assembled.simulation;
  if (simulation && StellarSdk.rpc.Api.isSimulationError(simulation)) {
    throw new Error(simulation.error ?? "Token balance simulation failed");
  }
  return scValToBigIntSafe(simulation?.result?.retval);
}

function getBalanceArgName(client: TokenClient): string {
  try {
    const inputs = client.spec.getFunc("balance").inputs();
    const first = inputs[0];
    if (!first) throw new Error("no inputs");
    return first.name().toString();
  } catch {
    return "id";
  }
}

async function simulateBalanceViaClient(
  client: TokenClient,
  ownerAddress: string,
): Promise<bigint> {
  if (typeof client.balance !== "function") {
    throw new Error(
      "This contract does not implement a balance method. Use a Stellar Asset Contract (C... address).",
    );
  }
  const argName = getBalanceArgName(client);
  const assembled = await client.balance(
    { [argName]: ownerAddress },
    { simulate: true },
  );
  checkSimulationError(assembled);
  return balanceFromSimulation(assembled);
}

async function simulateDecimalsViaClient(client: TokenClient): Promise<number> {
  if (typeof client.decimals !== "function") {
    return DEFAULT_TOKEN_DECIMALS;
  }
  try {
    const assembled = await client.decimals({ simulate: true });
    checkSimulationError(assembled);
    return u32FromSimulation(assembled);
  } catch {
    return DEFAULT_TOKEN_DECIMALS;
  }
}

/** SAC interface: `decimals() -> u32` */
export async function fetchTokenDecimals(contractId: string): Promise<number> {
  try {
    const client = (await StellarSdk.contract.Client.from(
      getRpcClientOptions(contractId),
    )) as TokenClient;
    if (typeof client.decimals !== "function") {
      return DEFAULT_TOKEN_DECIMALS;
    }
    const assembled = await client.decimals({ simulate: true });
    checkSimulationError(assembled);
    return u32FromSimulation(assembled);
  } catch {
    return DEFAULT_TOKEN_DECIMALS;
  }
}

async function simulateBalanceViaRpc(
  contractId: string,
  ownerAddress: string,
): Promise<bigint> {
  const server = new StellarSdk.rpc.Server(
    import.meta.env.PUBLIC_SOROBAN_RPC_URL,
    { allowHttp: import.meta.env.DEV },
  );
  const contract = new StellarSdk.Contract(contractId);
  const source = new StellarSdk.Account(NULL_ACCOUNT, "0");
  const op = contract.call(
    "balance",
    new StellarSdk.Address(ownerAddress).toScVal(),
  );
  const tx = new StellarSdk.TransactionBuilder(source, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: import.meta.env.PUBLIC_SOROBAN_NETWORK_PASSPHRASE,
  })
    .addOperation(op)
    .setTimeout(30)
    .build();

  const simulation = await server.simulateTransaction(tx);
  if (StellarSdk.rpc.Api.isSimulationError(simulation)) {
    throw new Error(simulation.error ?? "Token balance simulation failed");
  }
  return scValToBigIntSafe(simulation.result?.retval);
}

function buildTokenBalanceInfo(
  balanceStroops: bigint,
  decimals: number,
): TokenBalanceInfo {
  const tokenBalance = stroopsToTokenUnits(balanceStroops, decimals);
  const balanceInTokens =
    tokenBalance <= 0n || tokenBalance > BigInt(Number.MAX_SAFE_INTEGER)
      ? 0
      : Number(tokenBalance);
  const maxVoteWeight = toMaxVoteWeightInTokens(balanceStroops, decimals);
  return { balanceInTokens, maxVoteWeight, decimals };
}

/**
 * Reads token balance via SAC `balance` + `decimals`.
 * Voting power is expressed in whole tokens (not stroops).
 */
export async function getTokenBalance(
  tokenContract: string,
  ownerAddress: string,
): Promise<TokenBalanceInfo> {
  const contractId = tokenContract.trim();
  if (!SOROBAN_CONTRACT_ID_REGEX.test(contractId)) {
    throw new Error(
      "Invalid token contract address. Provide the Soroban contract ID (starts with C).",
    );
  }

  if (!ownerAddress?.startsWith("G")) {
    throw new Error("A connected Stellar wallet address is required.");
  }

  let balanceStroops: bigint;
  let decimals: number;

  try {
    const client = (await StellarSdk.contract.Client.from(
      getRpcClientOptions(contractId),
    )) as TokenClient;
    decimals = await simulateDecimalsViaClient(client);
    balanceStroops = await simulateBalanceViaClient(client, ownerAddress);
  } catch {
    try {
      decimals = await fetchTokenDecimals(contractId);
      balanceStroops = await simulateBalanceViaRpc(contractId, ownerAddress);
    } catch (rpcErr) {
      throw new Error(
        `Failed to read token balance: ${parseContractError(rpcErr)}`,
        { cause: rpcErr },
      );
    }
  }

  return buildTokenBalanceInfo(balanceStroops, decimals);
}
