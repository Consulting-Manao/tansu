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

export enum Status {
  Active = 0,
  Revoked = 1,
}

export enum Provider {
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

export const MembershipError = {
  /**
   * The caller is neither the token owner nor the admin.
   */
  100: { message: "UnauthorizedSigner" },
  /**
   * Indicates a non-existent `token_id`.
   */
  200: { message: "NonExistentToken" },
  /**
   * Indicates a non-existent `trait_key`.
   */
  201: { message: "TraitDoesNotExist" },
  /**
   * The address already holds a token.
   */
  202: { message: "MemberAlreadyExist" },
  /**
   * The external account is bound to another token.
   */
  203: { message: "AccountAlreadyBound" },
  /**
   * More projects than `MAX_PROJECTS`.
   */
  204: { message: "TooManyProjects" },
  /**
   * A string is empty or exceeds its maximum length.
   */
  205: { message: "InvalidLength" },
  /**
   * The token has been revoked.
   */
  206: { message: "TokenRevoked" },
  /**
   * More than one account for a provider.
   */
  207: { message: "DuplicateProvider" },
  /**
   * A recovery is already pending for this token.
   */
  300: { message: "RecoveryPending" },
  /**
   * No recovery is pending for this token.
   */
  301: { message: "NoRecovery" },
};

export interface Client {
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
   * Construct and simulate a recover transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  recover: (
    { token_id, new_address }: { token_id: u32; new_address: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;

  /**
   * Construct and simulate a recovery transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  recovery: (
    { token_id }: { token_id: u32 },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Option<RecoveryRequest>>>;

  /**
   * Construct and simulate a rotate_key transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  rotate_key: (
    { token_id, new_address }: { token_id: u32; new_address: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;

  /**
   * Construct and simulate a cancel_recovery transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  cancel_recovery: (
    { caller, token_id }: { caller: string; token_id: u32 },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;

  /**
   * Construct and simulate a propose_recovery transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  propose_recovery: (
    { token_id, new_address }: { token_id: u32; new_address: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;

  /**
   * Construct and simulate a finalize_recovery transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  finalize_recovery: (
    { token_id }: { token_id: u32 },
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
    { token_id }: { token_id: u32 },
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
   * Construct and simulate a attester transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  attester: (options?: MethodOptions) => Promise<AssembledTransaction<string>>;

  /**
   * Construct and simulate a owner_of transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  owner_of: (
    { token_id }: { token_id: u32 },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<string>>;

  /**
   * Construct and simulate a token_of transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  token_of: (
    { owner }: { owner: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Option<u32>>>;

  /**
   * Construct and simulate a token_uri transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  token_uri: (
    { token_id }: { token_id: u32 },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<string>>;

  /**
   * Construct and simulate a set_attester transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_attester: (
    { attester }: { attester: string },
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
    { token_id }: { token_id: u32 },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Member>>;

  /**
   * Construct and simulate a set_bio transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_bio: (
    { caller, token_id, bio }: { caller: string; token_id: u32; bio: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;

  /**
   * Construct and simulate a set_role transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_role: (
    { token_id, role }: { token_id: u32; role: Role },
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
    }: { caller: string; token_id: u32; projects: Array<string> },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;

  /**
   * Construct and simulate a token_by_account transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  token_by_account: (
    { provider, id }: { provider: Provider; id: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Option<u32>>>;

  /**
   * Construct and simulate a set_external_accounts transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_external_accounts: (
    {
      token_id,
      external_accounts,
    }: { token_id: u32; external_accounts: ExternalAccounts },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;
}
export class Client extends ContractClient {
  static async deploy<T = Client>(
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
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(
      { admin, attester, name, symbol, uri, uri_trait, nqg_contract },
      options,
    );
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([
        "AAAAAAAAAAAAAAAKZ292ZXJuYW5jZQAAAAAAAQAAAAAAAAAIdG9rZW5faWQAAAAEAAAAAQAAB9AAAAAKR292ZXJuYW5jZQAA",
        "AAAAAAAAAAAAAAALdHJhaXRfdmFsdWUAAAAAAgAAAAAAAAAIdG9rZW5faWQAAAAEAAAAAAAAAAl0cmFpdF9rZXkAAAAAAAAQAAAAAQAAAAs=",
        "AAAAAAAAAAAAAAAMdHJhaXRfdmFsdWVzAAAAAgAAAAAAAAAIdG9rZW5faWQAAAAEAAAAAAAAAAp0cmFpdF9rZXlzAAAAAAPqAAAAEAAAAAEAAAPqAAAACw==",
        "AAAAAAAAAAAAAAASdHJhaXRfbWV0YWRhdGFfdXJpAAAAAAAAAAAAAQAAABA=",
        "AAAAAAAAAAAAAAAHcmVjb3ZlcgAAAAACAAAAAAAAAAh0b2tlbl9pZAAAAAQAAAAAAAAAC25ld19hZGRyZXNzAAAAABMAAAAA",
        "AAAAAAAAAAAAAAAIcmVjb3ZlcnkAAAABAAAAAAAAAAh0b2tlbl9pZAAAAAQAAAABAAAD6AAAB9AAAAAPUmVjb3ZlcnlSZXF1ZXN0AA==",
        "AAAAAAAAAAAAAAAKcm90YXRlX2tleQAAAAAAAgAAAAAAAAAIdG9rZW5faWQAAAAEAAAAAAAAAAtuZXdfYWRkcmVzcwAAAAATAAAAAA==",
        "AAAAAAAAAAAAAAAPY2FuY2VsX3JlY292ZXJ5AAAAAAIAAAAAAAAABmNhbGxlcgAAAAAAEwAAAAAAAAAIdG9rZW5faWQAAAAEAAAAAA==",
        "AAAAAAAAAAAAAAAQcHJvcG9zZV9yZWNvdmVyeQAAAAIAAAAAAAAACHRva2VuX2lkAAAABAAAAAAAAAALbmV3X2FkZHJlc3MAAAAAEwAAAAA=",
        "AAAAAAAAAAAAAAARZmluYWxpemVfcmVjb3ZlcnkAAAAAAAABAAAAAAAAAAh0b2tlbl9pZAAAAAQAAAAA",
        "AAAAAAAAAAAAAAAEbWludAAAAAUAAAAAAAAAAnRvAAAAAAATAAAAAAAAAARyb2xlAAAH0AAAAARSb2xlAAAAAAAAABFleHRlcm5hbF9hY2NvdW50cwAAAAAAB9AAAAAQRXh0ZXJuYWxBY2NvdW50cwAAAAAAAAADYmlvAAAAABAAAAAAAAAACHByb2plY3RzAAAD6gAAABAAAAABAAAABA==",
        "AAAAAAAAAAAAAAAEbmFtZQAAAAAAAAABAAAAEA==",
        "AAAAAAAAAAAAAAAFYWRtaW4AAAAAAAAAAAAAAQAAABM=",
        "AAAAAAAAAAAAAAAGcmV2b2tlAAAAAAABAAAAAAAAAAh0b2tlbl9pZAAAAAQAAAAA",
        "AAAAAAAAAAAAAAAGc3ltYm9sAAAAAAAAAAAAAQAAABA=",
        "AAAAAAAAAAAAAAAHYmFsYW5jZQAAAAABAAAAAAAAAAVvd25lcgAAAAAAABMAAAABAAAABA==",
        "AAAAAAAAAAAAAAAHdXBncmFkZQAAAAABAAAAAAAAAAl3YXNtX2hhc2gAAAAAAAPuAAAAIAAAAAA=",
        "AAAAAAAAAAAAAAAIYXR0ZXN0ZXIAAAAAAAAAAQAAABM=",
        "AAAAAAAAAAAAAAAIb3duZXJfb2YAAAABAAAAAAAAAAh0b2tlbl9pZAAAAAQAAAABAAAAEw==",
        "AAAAAAAAAAAAAAAIdG9rZW5fb2YAAAABAAAAAAAAAAVvd25lcgAAAAAAABMAAAABAAAD6AAAAAQ=",
        "AAAAAAAAAAAAAAAJdG9rZW5fdXJpAAAAAAAAAQAAAAAAAAAIdG9rZW5faWQAAAAEAAAAAQAAABA=",
        "AAAAAAAAAAAAAAAMc2V0X2F0dGVzdGVyAAAAAQAAAAAAAAAIYXR0ZXN0ZXIAAAATAAAAAA==",
        "AAAAAAAAAAAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAcAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAIYXR0ZXN0ZXIAAAATAAAAAAAAAARuYW1lAAAAEAAAAAAAAAAGc3ltYm9sAAAAAAAQAAAAAAAAAAN1cmkAAAAAEAAAAAAAAAAJdXJpX3RyYWl0AAAAAAAAEAAAAAAAAAAMbnFnX2NvbnRyYWN0AAAAEwAAAAA=",
        "AAAAAAAAAAAAAAANbmV4dF90b2tlbl9pZAAAAAAAAAAAAAABAAAABA==",
        "AAAAAwAAAAAAAAAAAAAABFJvbGUAAAAEAAAAAAAAAAhWZXJpZmllZAAAAAAAAAAAAAAAClBhdGhmaW5kZXIAAAAAAAEAAAAAAAAACU5hdmlnYXRvcgAAAAAAAAIAAAAAAAAABVBpbG90AAAAAAAAAw==",
        "AAAAAQAAAAAAAAAAAAAABk1lbWJlcgAAAAAABQAAACJJUEZTIENJRCBvZiB0aGUgcHJvZmlsZSBkaXJlY3RvcnkuAAAAAAADYmlvAAAAABAAAAAAAAAAEWV4dGVybmFsX2FjY291bnRzAAAAAAAH0AAAABBFeHRlcm5hbEFjY291bnRzAAAAHERBT0lQLTUgcHJvamVjdCBpZGVudGlmaWVycy4AAAAIcHJvamVjdHMAAAPqAAAAEAAAAAAAAAAEcm9sZQAAB9AAAAAEUm9sZQAAAAAAAAAGc3RhdHVzAAAAAAfQAAAABlN0YXR1cwAA",
        "AAAAAwAAAAAAAAAAAAAABlN0YXR1cwAAAAAAAgAAAAAAAAAGQWN0aXZlAAAAAAAAAAAAAAAAAAdSZXZva2VkAAAAAAE=",
        "AAAAAwAAAAAAAAAAAAAACFByb3ZpZGVyAAAAAwAAAAAAAAAHRGlzY29yZAAAAAAAAAAAAAAAAAZHaXRodWIAAAAAAAEAAAAAAAAAAVgAAAAAAAAC",
        "AAAAAQAAAAAAAAAAAAAACkdvdmVybmFuY2UAAAAAAAIAAAAAAAAAA25xZwAAAAALAAAAAAAAAARyb2xlAAAH0AAAAARSb2xl",
        "AAAAAQAAADxBbiBhY2NvdW50IG9uIGFuIGV4dGVybmFsIHBsYXRmb3JtIHZlcmlmaWVkIGJ5IHRoZSBhdHRlc3Rlci4AAAAAAAAADVNvY2lhbEFjY291bnQAAAAAAAADAAAAK0Rpc3BsYXkgaGFuZGxlIGF0IHRoZSB0aW1lIG9mIHZlcmlmaWNhdGlvbi4AAAAABmhhbmRsZQAAAAAAEAAAADtTdGFibGUgaWRlbnRpZmllciBvbiB0aGUgcGxhdGZvcm0gKGUuZy4gRGlzY29yZCBzbm93Zmxha2UpLgAAAAACaWQAAAAAABAAAAAAAAAACHByb3ZpZGVyAAAH0AAAAAhQcm92aWRlcg==",
        "AAAAAQAAAAAAAAAAAAAAD1JlY292ZXJ5UmVxdWVzdAAAAAACAAAAAAAAAA1leGVjdXRhYmxlX2F0AAAAAAAABgAAAAAAAAALbmV3X2FkZHJlc3MAAAAAEw==",
        "AAAAAQAAAAAAAAAAAAAAEEV4dGVybmFsQWNjb3VudHMAAAACAAAAIUF0IG1vc3Qgb25lIGFjY291bnQgcGVyIHByb3ZpZGVyLgAAAAAAAAhhY2NvdW50cwAAA+oAAAfQAAAADVNvY2lhbEFjY291bnQAAAAAAAAoc2hhMjU2IG9mIHRoZSB0cmltbWVkLCBsb3dlcmNhc2VkIGVtYWlsLgAAAAplbWFpbF9oYXNoAAAAAAPoAAAD7gAAACA=",
        "AAAABAAAAAAAAAAAAAAAD01lbWJlcnNoaXBFcnJvcgAAAAALAAAANFRoZSBjYWxsZXIgaXMgbmVpdGhlciB0aGUgdG9rZW4gb3duZXIgbm9yIHRoZSBhZG1pbi4AAAASVW5hdXRob3JpemVkU2lnbmVyAAAAAABkAAAAJEluZGljYXRlcyBhIG5vbi1leGlzdGVudCBgdG9rZW5faWRgLgAAABBOb25FeGlzdGVudFRva2VuAAAAyAAAACVJbmRpY2F0ZXMgYSBub24tZXhpc3RlbnQgYHRyYWl0X2tleWAuAAAAAAAAEVRyYWl0RG9lc05vdEV4aXN0AAAAAAAAyQAAACJUaGUgYWRkcmVzcyBhbHJlYWR5IGhvbGRzIGEgdG9rZW4uAAAAAAASTWVtYmVyQWxyZWFkeUV4aXN0AAAAAADKAAAAL1RoZSBleHRlcm5hbCBhY2NvdW50IGlzIGJvdW5kIHRvIGFub3RoZXIgdG9rZW4uAAAAABNBY2NvdW50QWxyZWFkeUJvdW5kAAAAAMsAAAAiTW9yZSBwcm9qZWN0cyB0aGFuIGBNQVhfUFJPSkVDVFNgLgAAAAAAD1Rvb01hbnlQcm9qZWN0cwAAAADMAAAAMEEgc3RyaW5nIGlzIGVtcHR5IG9yIGV4Y2VlZHMgaXRzIG1heGltdW0gbGVuZ3RoLgAAAA1JbnZhbGlkTGVuZ3RoAAAAAAAAzQAAABtUaGUgdG9rZW4gaGFzIGJlZW4gcmV2b2tlZC4AAAAADFRva2VuUmV2b2tlZAAAAM4AAAAlTW9yZSB0aGFuIG9uZSBhY2NvdW50IGZvciBhIHByb3ZpZGVyLgAAAAAAABFEdXBsaWNhdGVQcm92aWRlcgAAAAAAAM8AAAAtQSByZWNvdmVyeSBpcyBhbHJlYWR5IHBlbmRpbmcgZm9yIHRoaXMgdG9rZW4uAAAAAAAAD1JlY292ZXJ5UGVuZGluZwAAAAEsAAAAJk5vIHJlY292ZXJ5IGlzIHBlbmRpbmcgZm9yIHRoaXMgdG9rZW4uAAAAAAAKTm9SZWNvdmVyeQAAAAABLQ==",
        "AAAABQAAAAAAAAAAAAAABkJpb1NldAAAAAAAAQAAAAdiaW9fc2V0AAAAAAIAAAAAAAAACHRva2VuX2lkAAAABAAAAAEAAAAAAAAAA2JpbwAAAAAQAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAABk1pbnRlZAAAAAAAAQAAAAZtaW50ZWQAAAAAAAYAAAAAAAAACHRva2VuX2lkAAAABAAAAAEAAAAAAAAAAnRvAAAAAAATAAAAAQAAAAAAAAAEcm9sZQAAB9AAAAAEUm9sZQAAAAAAAAAAAAAAEWV4dGVybmFsX2FjY291bnRzAAAAAAAH0AAAABBFeHRlcm5hbEFjY291bnRzAAAAAAAAAAAAAAADYmlvAAAAABAAAAAAAAAAAAAAAAhwcm9qZWN0cwAAA+oAAAAQAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAAB1Jldm9rZWQAAAAAAQAAAAdyZXZva2VkAAAAAAIAAAAAAAAACHRva2VuX2lkAAAABAAAAAEAAAAAAAAABGZyb20AAAATAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAAB1JvbGVTZXQAAAAAAQAAAAhyb2xlX3NldAAAAAIAAAAAAAAACHRva2VuX2lkAAAABAAAAAEAAAAAAAAABHJvbGUAAAfQAAAABFJvbGUAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAACVJlY292ZXJlZAAAAAAAAAEAAAAJcmVjb3ZlcmVkAAAAAAAAAwAAAAAAAAAIdG9rZW5faWQAAAAEAAAAAQAAAChgTm9uZWAgd2hlbiByZWluc3RhdGluZyBhIHJldm9rZWQgdG9rZW4uAAAABGZyb20AAAPoAAAAEwAAAAAAAAAAAAAAAnRvAAAAAAATAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAACktleVJvdGF0ZWQAAAAAAAEAAAALa2V5X3JvdGF0ZWQAAAAAAwAAAAAAAAAIdG9rZW5faWQAAAAEAAAAAQAAAAAAAAAEZnJvbQAAABMAAAAAAAAAAAAAAAJ0bwAAAAAAEwAAAAAAAAAC",
        "AAAABQAAAAAAAAAAAAAAC0F0dGVzdGVyU2V0AAAAAAEAAAAMYXR0ZXN0ZXJfc2V0AAAAAQAAAAAAAAAIYXR0ZXN0ZXIAAAATAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAAC1Byb2plY3RzU2V0AAAAAAEAAAAMcHJvamVjdHNfc2V0AAAAAgAAAAAAAAAIdG9rZW5faWQAAAAEAAAAAQAAAAAAAAAIcHJvamVjdHMAAAPqAAAAEAAAAAAAAAAC",
        "AAAABQAAAAAAAAAAAAAAEFJlY292ZXJ5UHJvcG9zZWQAAAABAAAAEXJlY292ZXJ5X3Byb3Bvc2VkAAAAAAAAAwAAAAAAAAAIdG9rZW5faWQAAAAEAAAAAQAAAAAAAAALbmV3X2FkZHJlc3MAAAAAEwAAAAAAAAAAAAAADWV4ZWN1dGFibGVfYXQAAAAAAAAGAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAAEVJlY292ZXJ5Q2FuY2VsbGVkAAAAAAAAAQAAABJyZWNvdmVyeV9jYW5jZWxsZWQAAAAAAAEAAAAAAAAACHRva2VuX2lkAAAABAAAAAEAAAAC",
        "AAAABQAAAAAAAAAAAAAAE0V4dGVybmFsQWNjb3VudHNTZXQAAAAAAQAAABVleHRlcm5hbF9hY2NvdW50c19zZXQAAAAAAAACAAAAAAAAAAh0b2tlbl9pZAAAAAQAAAABAAAAAAAAABFleHRlcm5hbF9hY2NvdW50cwAAAAAAB9AAAAAQRXh0ZXJuYWxBY2NvdW50cwAAAAAAAAAC",
        "AAAAAAAAAAAAAAAGbWVtYmVyAAAAAAABAAAAAAAAAAh0b2tlbl9pZAAAAAQAAAABAAAH0AAAAAZNZW1iZXIAAA==",
        "AAAAAAAAAAAAAAAHc2V0X2JpbwAAAAADAAAAAAAAAAZjYWxsZXIAAAAAABMAAAAAAAAACHRva2VuX2lkAAAABAAAAAAAAAADYmlvAAAAABAAAAAA",
        "AAAAAAAAAAAAAAAIc2V0X3JvbGUAAAACAAAAAAAAAAh0b2tlbl9pZAAAAAQAAAAAAAAABHJvbGUAAAfQAAAABFJvbGUAAAAA",
        "AAAAAAAAAAAAAAAMc2V0X3Byb2plY3RzAAAAAwAAAAAAAAAGY2FsbGVyAAAAAAATAAAAAAAAAAh0b2tlbl9pZAAAAAQAAAAAAAAACHByb2plY3RzAAAD6gAAABAAAAAA",
        "AAAAAAAAAAAAAAAQdG9rZW5fYnlfYWNjb3VudAAAAAIAAAAAAAAACHByb3ZpZGVyAAAH0AAAAAhQcm92aWRlcgAAAAAAAAACaWQAAAAAABAAAAABAAAD6AAAAAQ=",
        "AAAAAAAAAAAAAAAVc2V0X2V4dGVybmFsX2FjY291bnRzAAAAAAAAAgAAAAAAAAAIdG9rZW5faWQAAAAEAAAAAAAAABFleHRlcm5hbF9hY2NvdW50cwAAAAAAB9AAAAAQRXh0ZXJuYWxBY2NvdW50cwAAAAA=",
      ]),
      options,
    );
  }
  public readonly fromJSON = {
    governance: this.txFromJSON<Governance>,
    trait_value: this.txFromJSON<i128>,
    trait_values: this.txFromJSON<Array<i128>>,
    trait_metadata_uri: this.txFromJSON<string>,
    recover: this.txFromJSON<null>,
    recovery: this.txFromJSON<Option<RecoveryRequest>>,
    rotate_key: this.txFromJSON<null>,
    cancel_recovery: this.txFromJSON<null>,
    propose_recovery: this.txFromJSON<null>,
    finalize_recovery: this.txFromJSON<null>,
    mint: this.txFromJSON<u32>,
    name: this.txFromJSON<string>,
    admin: this.txFromJSON<string>,
    revoke: this.txFromJSON<null>,
    symbol: this.txFromJSON<string>,
    balance: this.txFromJSON<u32>,
    upgrade: this.txFromJSON<null>,
    attester: this.txFromJSON<string>,
    owner_of: this.txFromJSON<string>,
    token_of: this.txFromJSON<Option<u32>>,
    token_uri: this.txFromJSON<string>,
    set_attester: this.txFromJSON<null>,
    next_token_id: this.txFromJSON<u32>,
    member: this.txFromJSON<Member>,
    set_bio: this.txFromJSON<null>,
    set_role: this.txFromJSON<null>,
    set_projects: this.txFromJSON<null>,
    token_by_account: this.txFromJSON<Option<u32>>,
    set_external_accounts: this.txFromJSON<null>,
  };
}
