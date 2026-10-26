/**
 * Other contracts, as proposal outcomes call them: what functions they offer,
 * their arguments typed by their spec, and a dry run of each call.
 */
import {
  Address,
  Asset,
  BASE_FEE,
  Operation,
  TransactionBuilder,
  contract,
  rpc,
  scValToNative,
  StrKey,
  xdr,
} from "@stellar/stellar-sdk";
import { queryOptions } from "@tanstack/react-query";
import type { OutcomeContract } from "../../packages/tansu";
import { rpcServer } from "../contracts/soroban_tansu";
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
 * The contract `execute` asks to make outcome calls, kept in Tansu's instance
 * storage (`ContractKey::Executor`): the contract has no getter for it.
 */
const executorQuery = () =>
  queryOptions({
    queryKey: ["tansuExecutor"],
    queryFn: async () => {
      const { val } = await rpcServer.getContractData(
        import.meta.env.PUBLIC_TANSU_CONTRACT_ID,
        xdr.ScVal.scvLedgerKeyContractInstance(),
      );
      const instance =
        val.type === "contractData" &&
        val.contractData.val.type === "scvContractInstance"
          ? val.contractData.val.instance
          : undefined;
      const key = xdr.ScVal.scvVec([xdr.ScVal.scvSymbol("Executor")]);
      const executor = instance?.storage?.find((entry) =>
        entry.key.equals(key),
      );
      if (!executor) throw new Error("Tansu has no executor for outcome calls");
      return scValToNative(executor.val) as string;
    },
    // `set_executor` replaces it rarely, and only through an admin.
    staleTime: 60 * 60_000,
  });

/**
 * Why an outcome call cannot run, and the arguments to blame (by position):
 * none when the call as a whole fails.
 */
export class OutcomeCallError extends Error {
  constructor(
    message: string,
    readonly args: number[] = [],
  ) {
    super(message);
    this.name = "OutcomeCallError";
  }
}

/** The arguments as typed, encoded with the called function's spec. */
async function encodeOutcomeCall(call: OutcomeCall): Promise<OutcomeContract> {
  const spec = await queryClient.query(contractSpecQuery(call.address));
  const inputs = spec.getFunc(call.execute_fn).inputs;
  if (inputs.length !== call.args.length) {
    throw new Error(
      `${call.execute_fn} takes ${inputs.length} arguments, not ${call.args.length}`,
    );
  }
  const args = inputs.map((input, i) => {
    try {
      return spec.nativeToScVal(
        nativeArg(call.args[i]!, specTypeName(input.type)),
        input.type,
      );
    } catch (error) {
      throw new OutcomeCallError(
        `${input.name.toString()}: ${(error as Error).message}`,
        [i],
      );
    }
  });
  return { address: call.address, execute_fn: call.execute_fn, args };
}

/** Who an authorization entry asks a signature from. */
function signer(entry: xdr.SorobanAuthorizationEntry, source: string): string {
  const { credentials } = entry;
  switch (credentials.type) {
    case "sorobanCredentialsSourceAccount":
      return source;
    case "sorobanCredentialsAddress":
      return Address.fromScAddress(credentials.address.address).toString();
    case "sorobanCredentialsAddressV2":
      return Address.fromScAddress(credentials.addressV2.address).toString();
    case "sorobanCredentialsAddressWithDelegates":
      return Address.fromScAddress(
        credentials.addressWithDelegates.addressCredentials.address,
      ).toString();
  }
}

/**
 * Why a call failed, in the called contract's words: its error codes are its
 * own, not Tansu's, so they are named from its spec when it documents them.
 */
async function outcomeError(call: OutcomeCall, error: string): Promise<string> {
  const code = error.match(/Error\(Contract, #(\d+)\)/)?.[1];
  if (code === undefined) return errorMessage(error);
  const spec = await queryClient.query(contractSpecQuery(call.address));
  const known = spec
    .errorCases()
    .find((errorCase) => errorCase.value === Number(code));
  const doc = known?.doc.toString().trim();
  return known
    ? `error #${code} ${known.name.toString()}${doc ? ` (${doc})` : ""}`
    : `error #${code}`;
}

export interface OutcomeSimulation {
  /** The call, its arguments encoded, as the proposal stores it. */
  prepared: OutcomeContract;
  /** What the call returns, decoded. */
  returns: unknown;
  /**
   * Contracts that must authorize the call: it runs only when one of them
   * executes the proposal and authorizes it first, as a manager contract does.
   */
  authorizedBy: string[];
}

/**
 * A dry run of an outcome call as `execute` will make it: the executor calls
 * the target, so the target sees the executor as its caller, and no account
 * signs anything when the proposal executes. A call that needs an account's
 * signature, or that the target refuses, throws why. A contract's
 * authorization is reported: a manager contract gives it when it executes.
 *
 * The ledger can change before the proposal executes: a call that runs now may
 * not run then.
 */
export async function simulateOutcomeCall(
  call: OutcomeCall,
): Promise<OutcomeSimulation> {
  const prepared = await encodeOutcomeCall(call);
  const executor = await queryClient.query(executorQuery());
  // Any existing account builds the transaction: no one signs it.
  const source = import.meta.env.PUBLIC_TANSU_OWNER_ID;
  const account = await rpcServer.getAccount(source);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(
      Operation.invokeContractFunction({
        contract: executor,
        function: "run",
        args: [
          new Address(call.address).toScVal(),
          xdr.ScVal.scvSymbol(call.execute_fn),
          xdr.ScVal.scvVec(prepared.args),
        ],
      }),
    )
    .setTimeout(60)
    .build();
  // Recording every authorization, the target's own included: in the real
  // call none of them is signed.
  const simulation = await rpcServer.simulateTransaction(
    tx,
    undefined,
    "record_allow_nonroot",
    false,
  );
  const what = `${call.execute_fn} on ${call.address}`;
  if (rpc.Api.isSimulationError(simulation)) {
    throw new OutcomeCallError(
      `${what} cannot run: ${await outcomeError(call, simulation.error)}`,
    );
  }
  const signers = [
    ...new Set((simulation.result?.auth ?? []).map((e) => signer(e, source))),
  ];
  // An account cannot sign inside `execute`; a contract can authorize the call
  // ahead, as a manager contract executing the proposal does.
  const accounts = signers.filter((s) => !StrKey.isValidContract(s));
  if (accounts.length > 0) {
    // The arguments naming a signer are where the author can fix it.
    throw new OutcomeCallError(
      `${what} needs a signature from ${accounts.join(", ")}, and no one signs when the proposal executes`,
      call.args.flatMap((arg, i) => (accounts.includes(arg.trim()) ? [i] : [])),
    );
  }
  const retval = simulation.result?.retval;
  return {
    prepared,
    returns: retval ? scValToNative(retval) : undefined,
    authorizedBy: signers,
  };
}

/**
 * The call `execute` will make, its arguments encoded with the called
 * contract's spec, after a dry run as the executor makes it: a call that
 * cannot run is refused before the proposal is created.
 */
export async function prepareOutcomeCall(
  call: OutcomeCall,
): Promise<OutcomeContract> {
  return (await simulateOutcomeCall(call)).prepared;
}
