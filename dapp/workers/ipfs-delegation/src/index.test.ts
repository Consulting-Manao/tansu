import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CarReader } from "@ipld/car";
import {
  Account,
  Keypair,
  Networks,
  Operation,
  StrKey,
  TransactionBuilder,
  nativeToScVal,
} from "@stellar/stellar-sdk";
import {
  validateSignedTransaction,
  validateSubmittedTransaction,
  validateUploadRequest,
  calculateCidFromCar,
  buildUploadBlob,
} from "./index";

describe("validateSignedTransaction", () => {
  it("throws for empty string", () => {
    expect(() => validateSignedTransaction("")).toThrow(
      "Transaction signature is invalid",
    );
  });

  it("throws for invalid XDR", () => {
    expect(() => validateSignedTransaction("not-valid-xdr")).toThrow(
      "Transaction signature is invalid",
    );
  });
});

describe("calculateCidFromCar", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("throws for CAR with no root", async () => {
    vi.spyOn(CarReader, "fromBytes").mockResolvedValue({
      getRoots: async () => [],
      blocks: (async function* () {})(),
    } as any);

    const blob = new Blob([""], { type: "application/vnd.ipld.car" });
    await expect(calculateCidFromCar(blob)).rejects.toThrow(
      "CAR file has no declared root",
    );
  });

  it("returns root CID when present", async () => {
    const mockRoot = {
      toString: () => "bafyrei123",
    };
    vi.spyOn(CarReader, "fromBytes").mockResolvedValue({
      getRoots: async () => [mockRoot],
      blocks: (async function* () {})(),
    } as any);

    const blob = new Blob([""], { type: "application/vnd.ipld.car" });
    const cid = await calculateCidFromCar(blob);
    expect(cid).toBe("bafyrei123");
  });
});

describe("buildUploadBlob", () => {
  it("creates valid blob from base64 CAR", () => {
    const base64 = "Y3ViZQo=";
    const blob = buildUploadBlob(base64);
    expect(blob.type).toBe("application/vnd.ipld.car");
  });
});

describe("validateUploadRequest", () => {
  it("accepts exactly one proof", () => {
    expect(() =>
      validateUploadRequest({ cid: "c", car: "a", signedTxXdr: "x" }),
    ).not.toThrow();
    expect(() =>
      validateUploadRequest({ cid: "c", car: "a", txHash: "h" }),
    ).not.toThrow();
  });

  it("rejects both proofs or neither", () => {
    expect(() =>
      validateUploadRequest({
        cid: "c",
        car: "a",
        signedTxXdr: "x",
        txHash: "h",
      }),
    ).toThrow("Missing required fields");
    expect(() => validateUploadRequest({ cid: "c", car: "a" })).toThrow(
      "Missing required fields",
    );
  });
});

describe("validateSubmittedTransaction", () => {
  const RPC = "https://rpc.example";
  const CID = "bafyreitestcid";
  const HASH = "a".repeat(64);
  const CONTRACT = StrKey.encodeContract(Buffer.alloc(32, 1));

  function invokeTx(arg: string) {
    return new TransactionBuilder(
      new Account(Keypair.random().publicKey(), "1"),
      { fee: "100", networkPassphrase: Networks.TESTNET },
    )
      .addOperation(
        Operation.invokeContractFunction({
          contract: CONTRACT,
          function: "add_member",
          args: [nativeToScVal(arg, { type: "string" })],
        }),
      )
      .setTimeout(0)
      .build();
  }

  function mockRpc(result: Record<string, unknown>) {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result })),
      );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("accepts a successful call that records the CID", async () => {
    const fetchMock = mockRpc({
      status: "SUCCESS",
      envelopeXdr: invokeTx(CID).toEnvelope().toXDR("base64"),
    });
    await expect(
      validateSubmittedTransaction(HASH, CID, RPC),
    ).resolves.toBeUndefined();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({
      method: "getTransaction",
      params: { hash: HASH },
    });
  });

  it("accepts a fee-bumped call that records the CID", async () => {
    const feeBump = TransactionBuilder.buildFeeBumpTransaction(
      Keypair.random(),
      "200",
      invokeTx(CID),
      Networks.TESTNET,
    );
    mockRpc({
      status: "SUCCESS",
      envelopeXdr: feeBump.toEnvelope().toXDR("base64"),
    });
    await expect(
      validateSubmittedTransaction(HASH, CID, RPC),
    ).resolves.toBeUndefined();
  });

  it("rejects a call that does not record the CID", async () => {
    mockRpc({
      status: "SUCCESS",
      envelopeXdr: invokeTx("bafyreiother").toEnvelope().toXDR("base64"),
    });
    await expect(validateSubmittedTransaction(HASH, CID, RPC)).rejects.toThrow(
      `does not record ${CID}`,
    );
  });

  it.each(["FAILED", "NOT_FOUND"])(
    "rejects a %s transaction",
    async (status) => {
      mockRpc({ status });
      await expect(
        validateSubmittedTransaction(HASH, CID, RPC),
      ).rejects.toThrow(`did not succeed on-chain (${status})`);
    },
  );

  it("rejects when no RPC is configured", async () => {
    await expect(
      validateSubmittedTransaction(HASH, CID, undefined),
    ).rejects.toThrow("not configured");
  });

  it("rejects a malformed hash", async () => {
    await expect(
      validateSubmittedTransaction("not-a-hash", CID, RPC),
    ).rejects.toThrow("Invalid transaction hash");
  });
});
