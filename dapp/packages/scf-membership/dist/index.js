import { Buffer } from "buffer";
import {
  Client as ContractClient,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";
if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}
export var Role;
(function (Role) {
  Role[(Role["Pilot"] = 3)] = "Pilot";
  Role[(Role["Navigator"] = 2)] = "Navigator";
  Role[(Role["Pathfinder"] = 1)] = "Pathfinder";
  Role[(Role["Verified"] = 0)] = "Verified";
})(Role || (Role = {}));
export class Client extends ContractClient {
  options;
  static async deploy(
    /** Constructor/Initialization Args for the contract's `__constructor` method */
    { admin, name, symbol, uri, uri_trait, nqg_contract },
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options,
  ) {
    return ContractClient.deploy(
      { admin, name, symbol, uri, uri_trait, nqg_contract },
      options,
    );
  }
  constructor(options) {
    super(
      new ContractSpec([
        "AAAAAAAAAAAAAAAJc2V0X3RyYWl0AAAAAAAAAwAAAAAAAAAIdG9rZW5faWQAAAAEAAAAAAAAAAl0cmFpdF9rZXkAAAAAAAAQAAAAAAAAAAluZXdfdmFsdWUAAAAAAAALAAAAAA==",
        "AAAAAAAAAAAAAAAKZ292ZXJuYW5jZQAAAAAAAQAAAAAAAAAIdG9rZW5faWQAAAAEAAAAAQAAB9AAAAAKR292ZXJuYW5jZQAA",
        "AAAAAAAAAAAAAAALdHJhaXRfdmFsdWUAAAAAAgAAAAAAAAAIdG9rZW5faWQAAAAEAAAAAAAAAAl0cmFpdF9rZXkAAAAAAAAQAAAAAQAAAAs=",
        "AAAAAAAAAAAAAAAMdHJhaXRfdmFsdWVzAAAAAgAAAAAAAAAIdG9rZW5faWQAAAAEAAAAAAAAAAp0cmFpdF9rZXlzAAAAAAPqAAAAEAAAAAEAAAPqAAAACw==",
        "AAAAAAAAAAAAAAASdHJhaXRfbWV0YWRhdGFfdXJpAAAAAAAAAAAAAQAAABA=",
        "AAAAAwAAAAAAAAAAAAAABFJvbGUAAAAEAAAAAAAAAAVQaWxvdAAAAAAAAAMAAAAAAAAACU5hdmlnYXRvcgAAAAAAAAIAAAAAAAAAClBhdGhmaW5kZXIAAAAAAAEAAAAAAAAACFZlcmlmaWVkAAAAAA==",
        "AAAAAQAAAAAAAAAAAAAACkdvdmVybmFuY2UAAAAAAAIAAAAAAAAAA25xZwAAAAALAAAAAAAAAARyb2xlAAAH0AAAAARSb2xl",
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
    this.options = options;
  }
  fromJSON = {
    set_trait: this.txFromJSON,
    governance: this.txFromJSON,
    trait_value: this.txFromJSON,
    trait_values: this.txFromJSON,
    trait_metadata_uri: this.txFromJSON,
    mint: this.txFromJSON,
    name: this.txFromJSON,
    symbol: this.txFromJSON,
    balance: this.txFromJSON,
    upgrade: this.txFromJSON,
    clawback: this.txFromJSON,
    owner_of: this.txFromJSON,
    token_uri: this.txFromJSON,
  };
}
