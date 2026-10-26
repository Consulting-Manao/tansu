import { Buffer } from "buffer";
import * as StellarSdk from "@stellar/stellar-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { rpcServer, tansuFor } from "../../../src/contracts/soroban_tansu";

const ACCOUNT = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const SMART_ACCOUNT =
  "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";

afterEach(() => vi.restoreAllMocks());

describe("tansuFor", () => {
  it("builds an account's calls from that account", () => {
    expect(tansuFor(ACCOUNT).options.publicKey).toBe(ACCOUNT);
  });

  // Its wallet relays the transaction: any existing account builds it.
  it("builds a smart account's calls from an existing account", () => {
    expect(tansuFor(SMART_ACCOUNT).options.publicKey).toBe(
      import.meta.env.PUBLIC_TANSU_OWNER_ID,
    );
  });

  it("applies the configured fee to built contract transactions", async () => {
    vi.spyOn(rpcServer, "getAccount").mockResolvedValue(
      new StellarSdk.Account(ACCOUNT, "1"),
    );

    const tx = await tansuFor(ACCOUNT).remove_vote(
      {
        maintainer: ACCOUNT,
        project_key: Buffer.alloc(32),
        proposal_id: 0,
        voter: ACCOUNT,
      },
      { simulate: false },
    );

    expect(tx.raw?.build().fee).toBe(import.meta.env.PUBLIC_DEFAULT_FEE);
  });
});
