import * as StellarSdk from "@stellar/stellar-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { kitSignMock, disconnectMock, uploadMock } = vi.hoisted(() => ({
  kitSignMock: vi.fn(),
  disconnectMock: vi.fn(),
  uploadMock: vi.fn(),
}));

vi.mock("../../../src/components/stellar-wallets-kit", () => ({
  StellarWalletsKit: { signTransaction: kitSignMock },
}));

vi.mock("../../../src/utils/ipfsFunctions", async (importOriginal) => ({
  ...(await importOriginal()),
  uploadToIpfsProxy: uploadMock,
}));

let connected = "";
vi.mock("../../../src/service/walletService", async (importOriginal) => ({
  ...(await importOriginal()),
  loadedPublicKey: () => connected,
  connectedAddress: () => connected,
  disconnect: disconnectMock,
}));

import { queryClient } from "../../../src/service/queryClient";
import {
  checkAuthorization,
  packUpload,
  sendTransaction,
  sendXLM,
} from "../../../src/service/TxService";
import { ipfsQuery } from "../../../src/utils/ipfsFunctions";

const { rpc, xdr } = StellarSdk;
const SMART_ACCOUNT =
  "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";

/** A signed envelope, as a wallet returns it, that can land until `maxTime`. */
function signedEnvelope(maxTime = Math.floor(Date.now() / 1000) + 30): string {
  const account = new StellarSdk.Account(
    StellarSdk.Keypair.random().publicKey(),
    "1",
  );
  return new StellarSdk.TransactionBuilder(account, {
    fee: "100",
    networkPassphrase: import.meta.env.PUBLIC_SOROBAN_NETWORK_PASSPHRASE,
    timebounds: { minTime: 0, maxTime },
  })
    .addOperation(StellarSdk.Operation.bumpSequence({ bumpTo: "2" }))
    .build()
    .toXDR();
}

const TANSU = import.meta.env.PUBLIC_TANSU_CONTRACT_ID;
const XLM = StellarSdk.Asset.native().contractId(
  import.meta.env.PUBLIC_SOROBAN_NETWORK_PASSPHRASE,
);

/** A contract call in an authorization tree. */
const invoke = (
  contract: string,
  functionName: string,
  args: StellarSdk.xdr.ScVal[] = [],
  subInvocations: object[] = [],
) => ({
  function: {
    type: "sorobanAuthorizedFunctionTypeContractFn",
    contractFn: {
      contractAddress: StellarSdk.Address.fromString(contract).toScAddress(),
      functionName,
      args,
    },
  },
  subInvocations,
});

/** A contract call, simulated, whose result is a u32. */
function call(simulation: object = {}, auth: object[] = []) {
  return {
    simulation,
    simulationData: { result: { auth } },
    toXDR: () => "unsigned-xdr",
    options: {
      parseResultXdr: (value: StellarSdk.xdr.ScVal) =>
        StellarSdk.scValToNative(value),
    },
  } as unknown as StellarSdk.contract.AssembledTransaction<number>;
}

const upload = { cid: "bafy-dir", carBlob: new Blob(["car"]) };

describe("sendTransaction", () => {
  const order: string[] = [];
  let send: ReturnType<typeof vi.spyOn>;
  let poll: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    order.length = 0;
    connected = StellarSdk.Keypair.random().publicKey();
    uploadMock.mockImplementation(async () => void order.push("upload"));
    send = vi
      .spyOn(rpc.Server.prototype, "sendTransaction")
      .mockImplementation(async () => {
        order.push("send");
        return { status: "PENDING", hash: "a".repeat(64) } as any;
      });
    poll = vi
      .spyOn(rpc.Server.prototype, "getTransaction")
      .mockImplementation(async () => {
        order.push("confirm");
        return { status: "SUCCESS", returnValue: xdr.ScVal.scvU32(7) } as any;
      });
  });

  afterEach(() => vi.restoreAllMocks());

  it("signs once, uploads with the envelope, sends, and refetches", async () => {
    const envelope = signedEnvelope();
    kitSignMock.mockResolvedValue({ signedTxXdr: envelope });
    const refetch = vi.spyOn(queryClient, "invalidateQueries");
    const onProgress = vi.fn();

    await expect(
      sendTransaction(call(), {
        upload,
        onProgress,
        invalidate: [["proposals", "ab"]],
      }),
    ).resolves.toEqual({ result: 7, hash: "a".repeat(64) });

    expect(kitSignMock).toHaveBeenCalledOnce();
    expect(kitSignMock).toHaveBeenCalledWith(
      "unsigned-xdr",
      expect.objectContaining({ address: connected }),
    );
    expect(uploadMock).toHaveBeenCalledWith({
      ...upload,
      signedTxXdr: envelope,
    });
    expect(order).toEqual(["upload", "send", "confirm"]);
    expect(onProgress.mock.calls).toEqual([[8], [9]]);
    expect(refetch).toHaveBeenCalledWith({ queryKey: ["proposals", "ab"] });
  });

  it("confirms a transaction the wallet submitted, then uploads with its hash", async () => {
    const hash = "b".repeat(64);
    kitSignMock.mockResolvedValue({ signedTxXdr: hash, submitted: true });

    await expect(sendTransaction(call(), { upload })).resolves.toEqual({
      result: 7,
      hash,
    });
    expect(send).not.toHaveBeenCalled();
    expect(poll).toHaveBeenCalledWith(hash);
    expect(uploadMock).toHaveBeenCalledWith({ ...upload, txHash: hash });
    expect(order).toEqual(["confirm", "upload"]);
  });

  it("says the transaction is on-chain when the late upload fails", async () => {
    const hash = "c".repeat(64);
    kitSignMock.mockResolvedValue({ signedTxXdr: hash, submitted: true });
    uploadMock.mockRejectedValue(new Error("Filebase HTTP 502"));

    await expect(sendTransaction(call(), { upload })).rejects.toThrow(
      `Transaction ${hash} is on-chain but its IPFS upload failed: Filebase HTTP 502`,
    );
  });

  it("refetches after a failed transaction: it may still have landed", async () => {
    kitSignMock.mockResolvedValue({ signedTxXdr: signedEnvelope() });
    poll.mockResolvedValue({ status: "FAILED" } as any);
    const refetch = vi.spyOn(queryClient, "invalidateQueries");

    await expect(
      sendTransaction(call(), { invalidate: [["commit", "ab"]] }),
    ).rejects.toThrow("failed on-chain");
    expect(refetch).toHaveBeenCalledWith({ queryKey: ["commit", "ab"] });
  });

  it("keeps waiting through network errors", async () => {
    kitSignMock.mockResolvedValue({ signedTxXdr: signedEnvelope() });
    poll.mockRejectedValueOnce(new Error("socket hang up"));

    await expect(sendTransaction(call())).resolves.toMatchObject({
      result: 7,
    });
    expect(poll).toHaveBeenCalledTimes(2);
  }, 10_000);

  it("says a transaction past its time bound expired", async () => {
    const past = Math.floor(Date.now() / 1000) - 60;
    kitSignMock.mockResolvedValue({ signedTxXdr: signedEnvelope(past) });
    poll.mockResolvedValue({ status: "NOT_FOUND" } as any);

    await expect(sendTransaction(call())).rejects.toThrow(
      "expired without landing",
    );
  });

  it("says when the network cannot tell whether it landed", async () => {
    const past = Math.floor(Date.now() / 1000) - 60;
    kitSignMock.mockResolvedValue({ signedTxXdr: signedEnvelope(past) });
    poll.mockRejectedValue(new Error("socket hang up"));

    await expect(sendTransaction(call())).rejects.toThrow(
      "could not be read: check it",
    );
  });

  it("shows a contract error before asking the wallet", async () => {
    await expect(
      sendTransaction(call({ error: "HostError: Error(Contract, #201)" })),
    ).rejects.toThrow("already exist");
    expect(kitSignMock).not.toHaveBeenCalled();
  });

  it("disconnects when the user asks for a different account", async () => {
    const switchError = new Error("switch");
    switchError.name = "ACCOUNT_SWITCH_REQUESTED";
    kitSignMock.mockRejectedValue(switchError);

    await expect(sendTransaction(call())).rejects.toThrow(
      "Connect again, pick the account you want, then retry.",
    );
    expect(disconnectMock).toHaveBeenCalled();
  });
});

describe("checkAuthorization", () => {
  const member = StellarSdk.Keypair.random().publicKey();
  const address = (a: string) => StellarSdk.Address.fromString(a).toScVal();
  const collateral = invoke(XLM, "transfer", [
    address(member),
    address(TANSU),
    StellarSdk.nativeToScVal(50_000_000n, { type: "i128" }),
  ]);

  it("signs the Tansu call and its collateral", () => {
    expect(() =>
      checkAuthorization(
        call({}, [
          { rootInvocation: invoke(TANSU, "register", [], [collateral]) },
        ]),
      ),
    ).not.toThrow();
  });

  it("signs nothing else on the member's behalf", () => {
    const drain = invoke(XLM, "transfer", [
      address(member),
      address(StellarSdk.Keypair.random().publicKey()),
      StellarSdk.nativeToScVal(1n, { type: "i128" }),
    ]);
    for (const auth of [
      { rootInvocation: invoke(TANSU, "execute", [], [drain]) },
      { rootInvocation: invoke(XLM, "transfer") },
    ]) {
      expect(() => checkAuthorization(call({}, [auth]))).toThrow(
        "so it is not signed",
      );
    }
  });
});

describe("packUpload", () => {
  it("shows the text files it packs without asking a gateway", async () => {
    const toml = new File(['VERSION = "2.0.0"'], "tansu.toml");
    const logo = new File([new Uint8Array([1, 2])], "logo.png");

    const { cid } = await packUpload([toml, logo]);

    expect(
      queryClient.getQueryData(ipfsQuery(cid, "/tansu.toml").queryKey),
    ).toBe('VERSION = "2.0.0"');
    expect(
      queryClient.getQueryData(ipfsQuery(cid, "/logo.png").queryKey),
    ).toBeUndefined();
  });
});

describe("sendXLM", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connected = StellarSdk.Keypair.random().publicKey();
  });

  afterEach(() => vi.unstubAllGlobals());

  it("signs a donation to Tansu, and lands it like a contract call", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          sequence: "41",
          balances: [{ asset_type: "native", balance: "20.0000000" }],
        }),
      ),
    );
    kitSignMock.mockImplementation(async (xdr: string) => ({
      signedTxXdr: xdr,
    }));
    const send = vi
      .spyOn(rpc.Server.prototype, "sendTransaction")
      .mockResolvedValue({ status: "PENDING", hash: "d".repeat(64) } as any);
    const landed = vi
      .spyOn(rpc.Server.prototype, "getTransaction")
      .mockResolvedValue({ status: "SUCCESS" } as any);

    await sendXLM("10.5", "thanks");

    const sent = send.mock.calls[0]![0] as StellarSdk.Transaction;
    expect(sent.source).toBe(connected);
    expect(sent.sequence).toBe("42");
    expect(Buffer.from(sent.memo.value as Uint8Array).toString()).toBe(
      "thanks",
    );
    // A payment that cannot land later than three minutes from now.
    expect(Number(sent.timeBounds!.maxTime)).toBeGreaterThan(0);
    expect(
      sent.operations.map((op) => {
        const { destination, amount } = op as StellarSdk.Operation.Payment;
        return [destination, amount];
      }),
    ).toEqual([[import.meta.env.PUBLIC_TANSU_OWNER_ID, "10.5000000"]]);
    expect(landed).toHaveBeenCalledWith("d".repeat(64));
    vi.restoreAllMocks();
  });

  it("asks an account the network does not know to be funded first", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 404 })),
    );

    await expect(sendXLM("10", "thanks")).rejects.toThrow(
      "fund it, then donate",
    );
    expect(kitSignMock).not.toHaveBeenCalled();
  });

  it("refuses to donate from a smart account", async () => {
    connected = SMART_ACCOUNT;

    await expect(sendXLM("10", "thanks")).rejects.toThrow(
      "smart-account wallets",
    );
    expect(kitSignMock).not.toHaveBeenCalled();
  });
});
