import { describe, it, expect, vi } from "vitest";
import * as StellarSdk from "@stellar/stellar-sdk";

const { xdr } = StellarSdk;

// Mock the toast dependency that TxService imports via the "utils/utils" alias.
vi.mock("../../../src/utils/utils", () => ({
  toast: { error: vi.fn() },
}));

async function loadModule() {
  const mod = await import("../../../src/service/TxService");
  return mod;
}

describe("decodeReturnValue", () => {
  it("returns true for undefined", async () => {
    const { decodeReturnValue } = await loadModule();
    expect(await decodeReturnValue(undefined)).toBe(true);
  });

  it("returns number unchanged", async () => {
    const { decodeReturnValue } = await loadModule();
    expect(await decodeReturnValue(42)).toBe(42);
    expect(await decodeReturnValue(0)).toBe(0);
    expect(await decodeReturnValue(-1)).toBe(-1);
  });

  it("returns boolean unchanged", async () => {
    const { decodeReturnValue } = await loadModule();
    expect(await decodeReturnValue(true)).toBe(true);
    expect(await decodeReturnValue(false)).toBe(false);
  });

  it("decodes base64 u32 ScVal to number", async () => {
    const { decodeReturnValue } = await loadModule();
    const scVal = xdr.ScVal.scvU32(12345);
    const b64 = scVal.toXDR("base64");
    expect(await decodeReturnValue(b64)).toBe(12345);
  });

  it("decodes base64 i64 ScVal to number", async () => {
    const { decodeReturnValue } = await loadModule();
    const scVal = xdr.ScVal.scvI64(new xdr.Int64(999));
    const b64 = scVal.toXDR("base64");
    expect(await decodeReturnValue(b64)).toBe(999);
  });

  it("decodes base64 bool ScVal to true (passes through scValToNative)", async () => {
    const { decodeReturnValue } = await loadModule();
    const scVal = xdr.ScVal.scvBool(true);
    const b64 = scVal.toXDR("base64");
    expect(await decodeReturnValue(b64)).toBe(true);
  });

  it("returns true for invalid base64 XDR (catch fallback)", async () => {
    const { decodeReturnValue } = await loadModule();
    expect(await decodeReturnValue("not-valid-xdr")).toBe(true);
  });

  it("converts bigint to number", async () => {
    const { decodeReturnValue } = await loadModule();
    const scVal = xdr.ScVal.scvU64(new xdr.Uint64(BigInt(5000)));
    const b64 = scVal.toXDR("base64");
    const result = await decodeReturnValue(b64);
    expect(typeof result).toBe("number");
    expect(result).toBe(5000);
  });

  it("decodes i128 ScVal (bigint -> number)", async () => {
    const { decodeReturnValue } = await loadModule();
    const parts = new xdr.Int128Parts({
      lo: new xdr.Uint64(BigInt(100)),
      hi: new xdr.Int64(BigInt(0)),
    });
    const scVal = xdr.ScVal.scvI128(parts);
    const b64 = scVal.toXDR("base64");
    const result = await decodeReturnValue(b64);
    expect(typeof result).toBe("number");
    expect(result).toBe(100);
  });
});

describe("isStellarNetworkError", () => {
  it("returns true for Stellar error strings", async () => {
    const { isStellarNetworkError } = await loadModule();
    expect(isStellarNetworkError("op_underfunded")).toBe(true);
    expect(isStellarNetworkError("tx_insufficient_fee")).toBe(true);
    expect(isStellarNetworkError("tx_bad_seq")).toBe(true);
  });

  it("returns true for Stellar error patterns in error objects", async () => {
    const { isStellarNetworkError } = await loadModule();
    expect(
      isStellarNetworkError(new Error("op_underfunded: not enough XLM")),
    ).toBe(true);
    expect(
      isStellarNetworkError(new Error("tx_bad_seq sequence number mismatch")),
    ).toBe(true);
  });

  it("returns false for non-Stellar errors", async () => {
    const { isStellarNetworkError } = await loadModule();
    expect(isStellarNetworkError(new Error("network timeout"))).toBe(false);
    expect(isStellarNetworkError("some random string")).toBe(false);
  });

  it("returns false for null, undefined, and empty", async () => {
    const { isStellarNetworkError } = await loadModule();
    expect(isStellarNetworkError(null)).toBe(false);
    expect(isStellarNetworkError(undefined)).toBe(false);
    expect(isStellarNetworkError("")).toBe(false);
  });

  it("ignores case when matching error patterns", async () => {
    const { isStellarNetworkError } = await loadModule();
    expect(isStellarNetworkError("OP_UNDERFUNDED")).toBe(true);
    expect(isStellarNetworkError("Tx_Bad_Seq")).toBe(true);
  });

  it("handles error-like objects with message property", async () => {
    const { isStellarNetworkError } = await loadModule();
    const err = {
      message: "tx_insufficient_fee: The fee is too low",
      response: { status: 400 },
    };
    expect(isStellarNetworkError(err)).toBe(true);
  });
});
