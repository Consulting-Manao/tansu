import { Buffer } from "buffer";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
} from "@stellar/stellar-sdk/contract";
import type { u32, i128 } from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";
export declare enum Role {
  Pilot = 3,
  Navigator = 2,
  Pathfinder = 1,
  Verified = 0,
}
export type DataKey =
  | {
      tag: "Admin";
      values: void;
    }
  | {
      tag: "NextTokenId";
      values: void;
    }
  | {
      tag: "Name";
      values: void;
    }
  | {
      tag: "Symbol";
      values: void;
    }
  | {
      tag: "Uri";
      values: void;
    }
  | {
      tag: "UriTrait";
      values: void;
    }
  | {
      tag: "NqgContract";
      values: void;
    };
export interface Governance {
  nqg: i128;
  role: Role;
}
export type NFTStorageKey =
  | {
      tag: "Owner";
      values: readonly [u32];
    }
  | {
      tag: "Balance";
      values: readonly [string];
    }
  | {
      tag: "Role";
      values: readonly [u32];
    };
export declare const NonFungibleTokenError: {
  /**
   * Indicates a non-existent `token_id`.
   */
  201: {
    message: string;
  };
  /**
   * Indicates a non-existent `trait_key`.
   */
  202: {
    message: string;
  };
  /**
   * Indicates that `trait_key` cannot be set.
   */
  203: {
    message: string;
  };
  204: {
    message: string;
  };
  205: {
    message: string;
  };
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
    }: {
      token_id: u32;
      trait_key: string;
      new_value: i128;
    },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;
  /**
   * Construct and simulate a governance transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  governance: (
    {
      token_id,
    }: {
      token_id: u32;
    },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Governance>>;
  /**
   * Construct and simulate a trait_value transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  trait_value: (
    {
      token_id,
      trait_key,
    }: {
      token_id: u32;
      trait_key: string;
    },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<i128>>;
  /**
   * Construct and simulate a trait_values transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  trait_values: (
    {
      token_id,
      trait_keys,
    }: {
      token_id: u32;
      trait_keys: Array<string>;
    },
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
    {
      to,
    }: {
      to: string;
    },
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
    {
      owner,
    }: {
      owner: string;
    },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<u32>>;
  /**
   * Construct and simulate a upgrade transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  upgrade: (
    {
      wasm_hash,
    }: {
      wasm_hash: Buffer;
    },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;
  /**
   * Construct and simulate a clawback transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  clawback: (
    {
      token_id,
    }: {
      token_id: u32;
    },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;
  /**
   * Construct and simulate a owner_of transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  owner_of: (
    {
      token_id,
    }: {
      token_id: u32;
    },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<string>>;
  /**
   * Construct and simulate a token_uri transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  token_uri: (
    {
      token_id,
    }: {
      token_id: u32;
    },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<string>>;
}
export declare class Client extends ContractClient {
  readonly options: ContractClientOptions;
  static deploy<T = Client>(
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
  ): Promise<AssembledTransaction<T>>;
  constructor(options: ContractClientOptions);
  readonly fromJSON: {
    set_trait: (json: string) => AssembledTransaction<null>;
    governance: (json: string) => AssembledTransaction<Governance>;
    trait_value: (json: string) => AssembledTransaction<bigint>;
    trait_values: (json: string) => AssembledTransaction<bigint[]>;
    trait_metadata_uri: (json: string) => AssembledTransaction<string>;
    mint: (json: string) => AssembledTransaction<number>;
    name: (json: string) => AssembledTransaction<string>;
    symbol: (json: string) => AssembledTransaction<string>;
    balance: (json: string) => AssembledTransaction<number>;
    upgrade: (json: string) => AssembledTransaction<null>;
    clawback: (json: string) => AssembledTransaction<null>;
    owner_of: (json: string) => AssembledTransaction<string>;
    token_uri: (json: string) => AssembledTransaction<string>;
  };
}
