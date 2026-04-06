import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}

export enum Role {
  Pilot = 3,
  Navigator = 2,
  Pathfinder = 1,
  Verified = 0,
}

export type DataKey =
  | { tag: "Admin"; values: void }
  | { tag: "NextTokenId"; values: void }
  | { tag: "Name"; values: void }
  | { tag: "Symbol"; values: void }
  | { tag: "Uri"; values: void }
  | { tag: "UriTrait"; values: void }
  | { tag: "NqgContract"; values: void };

export interface Governance {
  nqg: i128;
  role: Role;
}

export type NFTStorageKey =
  | { tag: "Owner"; values: readonly [u32] }
  | { tag: "Balance"; values: readonly [string] }
  | { tag: "Role"; values: readonly [u32] };

export const NonFungibleTokenError = {
  /**
   * Indicates a non-existent `token_id`.
   */
  201: { message: "NonExistentToken" },
  /**
   * Indicates a non-existent `trait_key`.
   */
  202: { message: "TraitDoesNotExist" },
  /**
   * Indicates that `trait_key` cannot be set.
   */
  203: { message: "TraitUnSettable" },
  204: { message: "RoleDoesNotExist" },
  205: { message: "NqgContractError" },
};

export interface Client {
  /**
   * Construct and simulate a set_trait transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_trait: (
    {
      token_id,
      trait_key,
      new_value,
    }: { token_id: u32; trait_key: string; new_value: i128 },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;

  /**
   * Construct and simulate a governance transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  governance: (
    { token_id }: { token_id: u32 },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Governance>>;

  /**
   * Construct and simulate a trait_value transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  trait_value: (
    { token_id, trait_key }: { token_id: u32; trait_key: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<i128>>;

  /**
   * Construct and simulate a trait_values transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  trait_values: (
    { token_id, trait_keys }: { token_id: u32; trait_keys: Array<string> },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Array<i128>>>;

  /**
   * Construct and simulate a trait_metadata_uri transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  trait_metadata_uri: (
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<string>>;

  /**
   * Construct and simulate a mint transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  mint: (
    { to }: { to: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<u32>>;

  /**
   * Construct and simulate a name transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  name: (options?: MethodOptions) => Promise<AssembledTransaction<string>>;

  /**
   * Construct and simulate a symbol transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  symbol: (options?: MethodOptions) => Promise<AssembledTransaction<string>>;

  /**
   * Construct and simulate a balance transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  balance: (
    { owner }: { owner: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<u32>>;

  /**
   * Construct and simulate a upgrade transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  upgrade: (
    { wasm_hash }: { wasm_hash: Buffer },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;

  /**
   * Construct and simulate a clawback transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  clawback: (
    { token_id }: { token_id: u32 },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;

  /**
   * Construct and simulate a owner_of transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  owner_of: (
    { token_id }: { token_id: u32 },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<string>>;

  /**
   * Construct and simulate a token_uri transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  token_uri: (
    { token_id }: { token_id: u32 },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<string>>;
}
export class Client extends ContractClient {
  static async deploy<T = Client>(
    /** Constructor/Initialization Args for the contract's `__constructor` method */
    {
      admin,
      name,
      symbol,
      uri,
      uri_trait,
      nqg_contract,
    }: {
      admin: string;
      name: string;
      symbol: string;
      uri: string;
      uri_trait: string;
      nqg_contract: string;
    },
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      },
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(
      { admin, name, symbol, uri, uri_trait, nqg_contract },
      options,
    );
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([
        "AAAAAAAAAAAAAAAJc2V0X3RyYWl0AAAAAAAAAwAAAAAAAAAIdG9rZW5faWQAAAAEAAAAAAAAAAl0cmFpdF9rZXkAAAAAAAAQAAAAAAAAAAluZXdfdmFsdWUAAAAAAAALAAAAAA==",
        "AAAAAAAAAAAAAAAKZ292ZXJuYW5jZQAAAAAAAQAAAAAAAAAIdG9rZW5faWQAAAAEAAAAAQAAB9AAAAAKR292ZXJuYW5jZQAA",
        "AAAAAAAAAAAAAAALdHJhaXRfdmFsdWUAAAAAAgAAAAAAAAAIdG9rZW5faWQAAAAEAAAAAAAAAAl0cmFpdF9rZXkAAAAAAAAQAAAAAQAAAAs=",
        "AAAAAAAAAAAAAAAMdHJhaXRfdmFsdWVzAAAAAgAAAAAAAAAIdG9rZW5faWQAAAAEAAAAAAAAAAp0cmFpdF9rZXlzAAAAAAPqAAAAEAAAAAEAAAPqAAAACw==",
        "AAAAAAAAAAAAAAASdHJhaXRfbWV0YWRhdGFfdXJpAAAAAAAAAAAAAQAAABA=",
        "AAAAAwAAAAAAAAAAAAAABFJvbGUAAAAEAAAAAAAAAAVQaWxvdAAAAAAAAAMAAAAAAAAACU5hdmlnYXRvcgAAAAAAAAIAAAAAAAAAClBhdGhmaW5kZXIAAAAAAAEAAAAAAAAACFZlcmlmaWVkAAAAAA==",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAABwAAAAAAAAAAAAAABUFkbWluAAAAAAAAAAAAAAAAAAALTmV4dFRva2VuSWQAAAAAAAAAAAAAAAAETmFtZQAAAAAAAAAAAAAABlN5bWJvbAAAAAAAAAAAAAAAAAADVXJpAAAAAAAAAAAAAAAACFVyaVRyYWl0AAAAAAAAAAAAAAALTnFnQ29udHJhY3QA",
        "AAAAAQAAAAAAAAAAAAAACkdvdmVybmFuY2UAAAAAAAIAAAAAAAAAA25xZwAAAAALAAAAAAAAAARyb2xlAAAH0AAAAARSb2xl",
        "AAAAAgAAAAAAAAAAAAAADU5GVFN0b3JhZ2VLZXkAAAAAAAADAAAAAQAAAAAAAAAFT3duZXIAAAAAAAABAAAABAAAAAEAAAAAAAAAB0JhbGFuY2UAAAAAAQAAABMAAAABAAAAAAAAAARSb2xlAAAAAQAAAAQ=",
        "AAAABAAAAAAAAAAAAAAAFU5vbkZ1bmdpYmxlVG9rZW5FcnJvcgAAAAAAAAUAAAAkSW5kaWNhdGVzIGEgbm9uLWV4aXN0ZW50IGB0b2tlbl9pZGAuAAAAEE5vbkV4aXN0ZW50VG9rZW4AAADJAAAAJUluZGljYXRlcyBhIG5vbi1leGlzdGVudCBgdHJhaXRfa2V5YC4AAAAAAAARVHJhaXREb2VzTm90RXhpc3QAAAAAAADKAAAAKUluZGljYXRlcyB0aGF0IGB0cmFpdF9rZXlgIGNhbm5vdCBiZSBzZXQuAAAAAAAAD1RyYWl0VW5TZXR0YWJsZQAAAADLAAAAAAAAABBSb2xlRG9lc05vdEV4aXN0AAAAzAAAAAAAAAAQTnFnQ29udHJhY3RFcnJvcgAAAM0=",
        "AAAABQAAAAAAAAAAAAAABE1pbnQAAAABAAAABG1pbnQAAAACAAAAAAAAAAJ0bwAAAAAAEwAAAAEAAAAAAAAACHRva2VuX2lkAAAABAAAAAAAAAAC",
        "AAAAAAAAAAAAAAAEbWludAAAAAEAAAAAAAAAAnRvAAAAAAATAAAAAQAAAAQ=",
        "AAAAAAAAAAAAAAAEbmFtZQAAAAAAAAABAAAAEA==",
        "AAAAAAAAAAAAAAAGc3ltYm9sAAAAAAAAAAAAAQAAABA=",
        "AAAAAAAAAAAAAAAHYmFsYW5jZQAAAAABAAAAAAAAAAVvd25lcgAAAAAAABMAAAABAAAABA==",
        "AAAAAAAAAAAAAAAHdXBncmFkZQAAAAABAAAAAAAAAAl3YXNtX2hhc2gAAAAAAAPuAAAAIAAAAAA=",
        "AAAAAAAAAAAAAAAIY2xhd2JhY2sAAAABAAAAAAAAAAh0b2tlbl9pZAAAAAQAAAAA",
        "AAAAAAAAAAAAAAAIb3duZXJfb2YAAAABAAAAAAAAAAh0b2tlbl9pZAAAAAQAAAABAAAAEw==",
        "AAAAAAAAAAAAAAAJdG9rZW5fdXJpAAAAAAAAAQAAAAAAAAAIdG9rZW5faWQAAAAEAAAAAQAAABA=",
        "AAAAAAAAAAAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAYAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAEbmFtZQAAABAAAAAAAAAABnN5bWJvbAAAAAAAEAAAAAAAAAADdXJpAAAAABAAAAAAAAAACXVyaV90cmFpdAAAAAAAABAAAAAAAAAADG5xZ19jb250cmFjdAAAABMAAAAA",
      ]),
      options,
    );
  }
  public readonly fromJSON = {
    set_trait: this.txFromJSON<null>,
    governance: this.txFromJSON<Governance>,
    trait_value: this.txFromJSON<i128>,
    trait_values: this.txFromJSON<Array<i128>>,
    trait_metadata_uri: this.txFromJSON<string>,
    mint: this.txFromJSON<u32>,
    name: this.txFromJSON<string>,
    symbol: this.txFromJSON<string>,
    balance: this.txFromJSON<u32>,
    upgrade: this.txFromJSON<null>,
    clawback: this.txFromJSON<null>,
    owner_of: this.txFromJSON<string>,
    token_uri: this.txFromJSON<string>,
  };
}
