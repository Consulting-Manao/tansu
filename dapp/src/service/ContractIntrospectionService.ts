/**
 * Other contracts, as proposal outcomes call them: what functions they offer,
 * their arguments typed by their spec, and a dry run of each call.
 */
import {
  Asset,
  BASE_FEE,
  Operation,
  TransactionBuilder,
  contract,
  rpc,
  xdr,
  StrKey,
} from "@stellar/stellar-sdk";
import { queryOptions } from "@tanstack/react-query";
import type { OutcomeContract } from "../../packages/tansu";
import { rpcServer, sourceAccountFor } from "../contracts/soroban_tansu";
import { errorMessage } from "../utils/contractErrors";
import type { OutcomeCall } from "../utils/proposalOutcomes";
import { queryClient } from "./queryClient";

const networkPassphrase = import.meta.env.PUBLIC_SOROBAN_NETWORK_PASSPHRASE;

export interface ContractFunction {
  name: string;
  inputs: ContractFunctionInput[];
}

export interface ContractFunctionInput {
  name: string;
  /** "u64", "address", "bytesn"...: the spec type without its prefix. */
  type: string;
}

/** A contract's spec, from its WASM on chain; the same for the session. */
const contractSpecQuery = (address: string) =>
  queryOptions({
    queryKey: ["contractSpec", address],
    queryFn: async () =>
      (
        await contract.Client.from({
          contractId: address,
          rpcUrl: import.meta.env.PUBLIC_SOROBAN_RPC_URL,
          networkPassphrase,
          allowHttp: import.meta.env.DEV,
        })
      ).spec,
    staleTime: Infinity,
  });

/** The functions a contract offers, with their arguments' names and types. */
export async function getContractFunctions(
  address: string,
): Promise<ContractFunction[]> {
  const spec = await queryClient.query(contractSpecQuery(address));
  return spec
    .funcs()
    .map((fn) => ({
      name: fn.name.toString(),
      inputs: fn.inputs.map((input) => ({
        name: input.name.toString(),
        type: specTypeName(input.type),
      })),
    }))
    .filter((fn) => fn.name !== "__constructor");
}

/** "scSpecTypeU64" → "u64", the names the argument inputs switch on. */
function specTypeName(type: xdr.ScSpecTypeDef): string {
  return type.type.replace(/^scSpecType/, "").toLowerCase();
}

export function isValidContractAddress(address: string): boolean {
  return StrKey.isValidContract(address);
}

/**
 * The call that fills an outcome slot with no call: the XLM contract's
 * read-only `decimals()`. `execute` runs the call at the outcome's position
 * and ignores what it returns, so this one changes nothing.
 */
export const NO_CALL: OutcomeContract = {
  address: Asset.native().contractId(networkPassphrase),
  execute_fn: "decimals",
  args: [],
};

export const isNoCall = (call: OutcomeContract): boolean =>
  call.address === NO_CALL.address &&
  call.execute_fn === NO_CALL.execute_fn &&
  call.args.length === 0;

/** An argument as typed, as the native value the spec encodes. */
function nativeArg(raw: string, type: string): unknown {
  const value = raw.trim();
  switch (type) {
    case "u32":
    case "i32":
      if (!/^-?\d+$/.test(value)) throw new Error(`"${raw}" is not a ${type}`);
      return Number(value);
    case "u64":
    case "i64":
    case "u128":
    case "i128":
    case "u256":
    case "i256":
    case "timepoint":
    case "duration":
      if (!/^-?\d+$/.test(value)) throw new Error(`"${raw}" is not a ${type}`);
      return BigInt(value);
    case "bool":
      if (value !== "true" && value !== "false") {
        throw new Error(`"${raw}" is not true or false`);
      }
      return value === "true";
    case "bytes":
    case "bytesn":
      if (!/^([0-9a-fA-F]{2})*$/.test(value)) {
        throw new Error(`"${raw}" is not hex bytes`);
      }
      return Buffer.from(value, "hex");
    case "address":
    case "string":
    case "symbol":
      return value;
    default:
      // Vectors, maps, options and custom types: as JSON.
      return JSON.parse(value);
  }
}

/**
 * The call `execute` will make, its arguments encoded with the called
 * contract's spec, after a dry run from `author`: a call that cannot run is
 * refused before the proposal is created.
 */
export async function prepareOutcomeCall(
  call: OutcomeCall,
  author: string,
): Promise<OutcomeContract> {
  const spec = await queryClient.query(contractSpecQuery(call.address));
  const inputs = spec.getFunc(call.execute_fn).inputs;
  if (inputs.length !== call.args.length) {
    throw new Error(
      `${call.execute_fn} takes ${inputs.length} arguments, not ${call.args.length}`,
    );
  }
  const args = inputs.map((input, i) =>
    spec.nativeToScVal(
      nativeArg(call.args[i]!, specTypeName(input.type)),
      input.type,
    ),
  );
  const prepared = { address: call.address, execute_fn: call.execute_fn, args };

  const account = await rpcServer.getAccount(sourceAccountFor(author));
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(
      Operation.invokeContractFunction({
        contract: call.address,
        function: call.execute_fn,
        args,
      }),
    )
    .setTimeout(60)
    .build();
  const simulation = await rpcServer.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(simulation)) {
    throw new Error(
      `${call.execute_fn} on ${call.address} cannot run: ${errorMessage(simulation.error)}`,
    );
  }
  return prepared;
}
