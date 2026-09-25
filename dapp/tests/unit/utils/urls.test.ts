import { describe, expect, it } from "vitest";
import { getStellarExpertUrl } from "../../../src/utils/urls";

const EXPLORER = "https://stellar.expert/explorer/testnet";

describe("getStellarExpertUrl", () => {
  it("links an account", () => {
    const account = "GBRWPW26ZA4TCUPO7ADVAGDKU6TXQJE45LZTV7XSJY6SJDZV5R72TA5L";
    expect(getStellarExpertUrl(account)).toBe(`${EXPLORER}/account/${account}`);
  });

  it("links a smart account as a contract", () => {
    const smart = "CA2JKAD2ZFT3HY7GHKEIEBEOHIPEPGZADICR7ISOXUSAXX63SFSJ4KBO";
    expect(getStellarExpertUrl(smart)).toBe(`${EXPLORER}/contract/${smart}`);
  });

  it("links a transaction", () => {
    expect(getStellarExpertUrl("ae81f753", "transaction")).toBe(
      `${EXPLORER}/tx/ae81f753`,
    );
  });
});
