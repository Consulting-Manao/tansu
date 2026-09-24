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
  packUpload,
  sendTransaction,
  sendXLM,
} from "../../../src/service/TxService";
import { ipfsQuery } from "../../../src/utils/ipfsFunctions";

const { rpc, xdr } = StellarSdk;
const SMART_ACCOUNT =
  "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";

/** A signed envelope, as a wallet returns it. */
function signedEnvelope(): string {
  const account = new StellarSdk.Account(
    StellarSdk.Keypair.random().publicKey(),
    "1",
  );
  return new StellarSdk.TransactionBuilder(account, {
    fee: "100",
    networkPassphrase: import.meta.env.PUBLIC_SOROBAN_NETWORK_PASSPHRASE,
  })
    .addOperation(StellarSdk.Operation.bumpSequence({ bumpTo: "2" }))
    .setTimeout(30)
    .build()
    .toXDR();
}

/** A contract call, simulated, whose result is a u32. */
function call(simulation: object = {}) {
  return {
    simulation,
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
      .spyOn(rpc.Server.prototype, "pollTransaction")
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
    expect(poll).toHaveBeenCalledWith(hash, expect.anything());
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
  const PROJECT = StellarSdk.Keypair.random().publicKey();
  const HORIZON = import.meta.env.PUBLIC_HORIZON_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    connected = StellarSdk.Keypair.random().publicKey();
  });

  afterEach(() => vi.unstubAllGlobals());

  it("signs the donation and the tip, and sends them through Horizon", async () => {
    const horizon = vi.fn(async (url: string) =>
      url.endsWith("/transactions")
        ? Response.json({ successful: true })
        : Response.json({
            sequence: "41",
            balances: [{ asset_type: "native", balance: "20.0000000" }],
          }),
    );
    vi.stubGlobal("fetch", horizon);
    kitSignMock.mockImplementation(async (xdr: string) => ({
      signedTxXdr: xdr,
    }));

    await sendXLM("10", PROJECT, "2", "thanks");

    expect(horizon.mock.calls[0]![0]).toBe(`${HORIZON}/accounts/${connected}`);
    const [url, init] = horizon.mock.calls[1] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(`${HORIZON}/transactions`);
    const sent = new StellarSdk.Transaction(
      decodeURIComponent(String(init.body).slice("tx=".length)),
      import.meta.env.PUBLIC_SOROBAN_NETWORK_PASSPHRASE,
    );
    expect(sent.source).toBe(connected);
    expect(sent.sequence).toBe("42");
    expect(Buffer.from(sent.memo.value as Uint8Array).toString()).toBe(
      "thanks",
    );
    expect(
      sent.operations.map((op) => {
        const { destination, amount } = op as StellarSdk.Operation.Payment;
        return [destination, amount];
      }),
    ).toEqual([
      [PROJECT, "10.0000000"],
      [import.meta.env.PUBLIC_TANSU_OWNER_ID, "2.0000000"],
    ]);
  });

  it("asks an account the network does not know to be funded first", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 404 })),
    );

    await expect(sendXLM("10", PROJECT, "0", "thanks")).rejects.toThrow(
      "fund it, then donate",
    );
    expect(kitSignMock).not.toHaveBeenCalled();
  });

  it("refuses to donate from a smart account", async () => {
    connected = SMART_ACCOUNT;

    await expect(sendXLM("10", PROJECT, "0", "thanks")).rejects.toThrow(
      "smart-account wallets",
    );
    expect(kitSignMock).not.toHaveBeenCalled();
  });
});
