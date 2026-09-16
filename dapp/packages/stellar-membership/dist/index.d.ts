import { Buffer } from "buffer";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
} from "@stellar/stellar-sdk/contract";
import type { u32, u64, i128, Option } from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";
export declare enum Role {
  Verified = 0,
  Pathfinder = 1,
  Navigator = 2,
  Pilot = 3,
}
export interface Member {
  /**
   * IPFS CID of the profile directory.
   */
  bio: string;
  external_accounts: ExternalAccounts;
  /**
   * DAOIP-5 project identifiers.
   */
  projects: Array<string>;
  role: Role;
  status: Status;
}
export declare enum Status {
  Active = 0,
  Revoked = 1,
}
export declare enum Provider {
  Discord = 0,
  Github = 1,
  X = 2,
}
export interface Governance {
  nqg: i128;
  role: Role;
}
/**
 * An account on an external platform verified by the attester.
 */
export interface SocialAccount {
  /**
   * Display handle at the time of verification.
   */
  handle: string;
  /**
   * Stable identifier on the platform (e.g. Discord snowflake).
   */
  id: string;
  provider: Provider;
}
export interface RecoveryRequest {
  executable_at: u64;
  new_address: string;
}
export interface ExternalAccounts {
  /**
   * At most one account per provider.
   */
  accounts: Array<SocialAccount>;
  /**
   * sha256 of the trimmed, lowercased email.
   */
  email_hash: Option<Buffer>;
}
export declare const MembershipError: {
  /**
   * The caller is neither the token owner nor the admin.
   */
  100: {
    message: string;
  };
  /**
   * Indicates a non-existent `token_id`.
   */
  200: {
    message: string;
  };
  /**
   * Indicates a non-existent `trait_key`.
   */
  201: {
    message: string;
  };
  /**
   * The address already holds a token.
   */
  202: {
    message: string;
  };
  /**
   * The external account is bound to another token.
   */
  203: {
    message: string;
  };
  /**
   * More projects than `MAX_PROJECTS`.
   */
  204: {
    message: string;
  };
  /**
   * A string is empty or exceeds its maximum length.
   */
  205: {
    message: string;
  };
  /**
   * The token has been revoked.
   */
  206: {
    message: string;
  };
  /**
   * More than one account for a provider.
   */
  207: {
    message: string;
  };
  /**
   * A recovery is already pending for this token.
   */
  300: {
    message: string;
  };
  /**
   * No recovery is pending for this token.
   */
  301: {
    message: string;
  };
};
export interface Client {
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
   * Construct and simulate a recover transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  recover: (
    {
      token_id,
      new_address,
    }: {
      token_id: u32;
      new_address: string;
    },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;
  /**
   * Construct and simulate a recovery transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  recovery: (
    {
      token_id,
    }: {
      token_id: u32;
    },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Option<RecoveryRequest>>>;
  /**
   * Construct and simulate a rotate_key transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  rotate_key: (
    {
      token_id,
      new_address,
    }: {
      token_id: u32;
      new_address: string;
    },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;
  /**
   * Construct and simulate a cancel_recovery transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  cancel_recovery: (
    {
      caller,
      token_id,
    }: {
      caller: string;
      token_id: u32;
    },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;
  /**
   * Construct and simulate a propose_recovery transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  propose_recovery: (
    {
      token_id,
      new_address,
    }: {
      token_id: u32;
      new_address: string;
    },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;
  /**
   * Construct and simulate a finalize_recovery transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  finalize_recovery: (
    {
      token_id,
    }: {
      token_id: u32;
    },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;
  /**
   * Construct and simulate a mint transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  mint: (
    {
      to,
      role,
      external_accounts,
      bio,
      projects,
    }: {
      to: string;
      role: Role;
      external_accounts: ExternalAccounts;
      bio: string;
      projects: Array<string>;
    },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<u32>>;
  /**
   * Construct and simulate a name transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  name: (options?: MethodOptions) => Promise<AssembledTransaction<string>>;
  /**
   * Construct and simulate a admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  admin: (options?: MethodOptions) => Promise<AssembledTransaction<string>>;
  /**
   * Construct and simulate a revoke transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  revoke: (
    {
      token_id,
    }: {
      token_id: u32;
    },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;
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
   * Construct and simulate a attester transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  attester: (options?: MethodOptions) => Promise<AssembledTransaction<string>>;
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
   * Construct and simulate a token_of transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  token_of: (
    {
      owner,
    }: {
      owner: string;
    },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Option<u32>>>;
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
  /**
   * Construct and simulate a set_attester transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_attester: (
    {
      attester,
    }: {
      attester: string;
    },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;
  /**
   * Construct and simulate a next_token_id transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  next_token_id: (
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<u32>>;
  /**
   * Construct and simulate a member transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  member: (
    {
      token_id,
    }: {
      token_id: u32;
    },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Member>>;
  /**
   * Construct and simulate a set_bio transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_bio: (
    {
      caller,
      token_id,
      bio,
    }: {
      caller: string;
      token_id: u32;
      bio: string;
    },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;
  /**
   * Construct and simulate a set_role transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_role: (
    {
      token_id,
      role,
    }: {
      token_id: u32;
      role: Role;
    },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;
  /**
   * Construct and simulate a set_projects transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_projects: (
    {
      caller,
      token_id,
      projects,
    }: {
      caller: string;
      token_id: u32;
      projects: Array<string>;
    },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;
  /**
   * Construct and simulate a token_by_account transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  token_by_account: (
    {
      provider,
      id,
    }: {
      provider: Provider;
      id: string;
    },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Option<u32>>>;
  /**
   * Construct and simulate a set_external_accounts transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_external_accounts: (
    {
      token_id,
      external_accounts,
    }: {
      token_id: u32;
      external_accounts: ExternalAccounts;
    },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;
}
export declare class Client extends ContractClient {
  readonly options: ContractClientOptions;
  static deploy<T = Client>(
    /** Constructor/Initialization Args for the contract's `__constructor` method */
    {
      admin,
      attester,
      name,
      symbol,
      uri,
      uri_trait,
      nqg_contract,
    }: {
      admin: string;
      attester: string;
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
    governance: (json: string) => AssembledTransaction<Governance>;
    trait_value: (json: string) => AssembledTransaction<bigint>;
    trait_values: (json: string) => AssembledTransaction<bigint[]>;
    trait_metadata_uri: (json: string) => AssembledTransaction<string>;
    recover: (json: string) => AssembledTransaction<null>;
    recovery: (json: string) => AssembledTransaction<Option<RecoveryRequest>>;
    rotate_key: (json: string) => AssembledTransaction<null>;
    cancel_recovery: (json: string) => AssembledTransaction<null>;
    propose_recovery: (json: string) => AssembledTransaction<null>;
    finalize_recovery: (json: string) => AssembledTransaction<null>;
    mint: (json: string) => AssembledTransaction<number>;
    name: (json: string) => AssembledTransaction<string>;
    admin: (json: string) => AssembledTransaction<string>;
    revoke: (json: string) => AssembledTransaction<null>;
    symbol: (json: string) => AssembledTransaction<string>;
    balance: (json: string) => AssembledTransaction<number>;
    upgrade: (json: string) => AssembledTransaction<null>;
    attester: (json: string) => AssembledTransaction<string>;
    owner_of: (json: string) => AssembledTransaction<string>;
    token_of: (json: string) => AssembledTransaction<Option<number>>;
    token_uri: (json: string) => AssembledTransaction<string>;
    set_attester: (json: string) => AssembledTransaction<null>;
    next_token_id: (json: string) => AssembledTransaction<number>;
    member: (json: string) => AssembledTransaction<Member>;
    set_bio: (json: string) => AssembledTransaction<null>;
    set_role: (json: string) => AssembledTransaction<null>;
    set_projects: (json: string) => AssembledTransaction<null>;
    token_by_account: (json: string) => AssembledTransaction<Option<number>>;
    set_external_accounts: (json: string) => AssembledTransaction<null>;
  };
}
