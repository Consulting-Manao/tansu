import { describe, expect, it } from "vitest";
import { tansuFor } from "../../../src/contracts/soroban_tansu";

const ACCOUNT = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const SMART_ACCOUNT =
  "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";

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
});
