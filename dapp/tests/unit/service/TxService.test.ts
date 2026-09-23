import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as StellarSdk from "@stellar/stellar-sdk";

const { xdr } = StellarSdk;

const { kitSignMock, kitGetAddressMock, disconnectMock, toastErrorMock } =
  vi.hoisted(() => ({
    kitSignMock: vi.fn(),
    kitGetAddressMock: vi.fn(),
    disconnectMock: vi.fn(),
    toastErrorMock: vi.fn(),
  }));

// Mock the toast dependency that TxService imports via the "utils/utils" alias.
vi.mock("../../../src/utils/utils", () => ({
  toast: { error: toastErrorMock },
}));

vi.mock("../../../src/components/stellar-wallets-kit", () => ({
  StellarWalletsKit: {
    signTransaction: kitSignMock,
    getAddress: kitGetAddressMock,
  },
}));

vi.mock("../../../src/service/walletService", () => ({
  loadedPublicKey: () => ACCOUNT,
  disconnect: disconnectMock,
}));

const ACCOUNT = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const SMART_ACCOUNT =
  "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";

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

describe("signAssembledTransaction", () => {
  const assembled = {
    simulate: vi.fn(),
    toXdr: () => "unsigned-xdr",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the signed envelope and names the connected account", async () => {
    const { signAssembledTransaction } = await loadModule();
    kitSignMock.mockResolvedValue({ signedTxXdr: "signed-xdr" });

    await expect(signAssembledTransaction(assembled)).resolves.toEqual({
      xdr: "signed-xdr",
    });
    expect(kitSignMock).toHaveBeenCalledWith(
      "unsigned-xdr",
      expect.objectContaining({ address: ACCOUNT }),
    );
  });

  it("returns the hash of a transaction the wallet submitted", async () => {
    const { signAssembledTransaction } = await loadModule();
    kitSignMock.mockResolvedValue({
      signedTxXdr: "b".repeat(64),
      submitted: true,
    });

    await expect(signAssembledTransaction(assembled)).resolves.toEqual({
      hash: "b".repeat(64),
    });
  });

  it("disconnects when the user asks for a different account", async () => {
    const { signAssembledTransaction } = await loadModule();
    const switchError = new Error("switch");
    switchError.name = "ACCOUNT_SWITCH_REQUESTED";
    kitSignMock.mockRejectedValue(switchError);

    await expect(signAssembledTransaction(assembled)).rejects.toThrow(
      "Connect again, pick the account you want, then retry.",
    );
    expect(disconnectMock).toHaveBeenCalled();
  });
});

describe("sendSignedTransaction", () => {
  beforeEach(() => {
    vi.stubEnv("PUBLIC_SOROBAN_RPC_URL", "https://rpc.example");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("only waits for a transaction the wallet submitted", async () => {
    const { sendSignedTransaction } = await loadModule();
    const send = vi.spyOn(StellarSdk.rpc.Server.prototype, "sendTransaction");
    const get = vi
      .spyOn(StellarSdk.rpc.Server.prototype, "getTransaction")
      .mockResolvedValue({
        status: "SUCCESS",
        returnValue: xdr.ScVal.scvU32(7),
      } as any);

    await expect(sendSignedTransaction({ hash: "c".repeat(64) })).resolves.toBe(
      7,
    );
    expect(get).toHaveBeenCalledWith("c".repeat(64));
    expect(send).not.toHaveBeenCalled();
  });
});

describe("sendXLM", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuses to donate from a smart account", async () => {
    const { sendXLM } = await loadModule();
    kitGetAddressMock.mockResolvedValue({ address: SMART_ACCOUNT });

    await expect(sendXLM("10", ACCOUNT, "0", "thanks")).resolves.toBe(false);
    expect(toastErrorMock).toHaveBeenCalledWith(
      "Transaction Failed",
      expect.stringContaining("smart-account wallets"),
    );
    expect(kitSignMock).not.toHaveBeenCalled();
  });
});
