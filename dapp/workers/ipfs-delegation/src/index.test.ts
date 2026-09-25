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
import worker, {
  validateSignedTransaction,
  validateSubmittedTransaction,
  validateUploadRequest,
  calculateCidFromCar,
  buildUploadBlob,
} from "./index";

const CID = "bafyreitestcid";
const TANSU = StrKey.encodeContract(Buffer.alloc(32, 1));
const ENV = {
  NETWORK_PASSPHRASE: Networks.TESTNET,
  TANSU_CONTRACT_ID: TANSU,
  SOROBAN_RPC_URL: "https://rpc.example",
};

/** A contract call with `cid` as argument, signed by its source. */
function invokeTx({
  cid = CID,
  contract = TANSU,
  network = Networks.TESTNET,
  timeout = 300,
}: {
  cid?: string;
  contract?: string;
  network?: string;
  timeout?: number;
} = {}) {
  const source = Keypair.random();
  const tx = new TransactionBuilder(new Account(source.publicKey(), "1"), {
    fee: "100",
    networkPassphrase: network,
  })
    .addOperation(
      Operation.invokeContractFunction({
        contract,
        function: "add_member",
        args: [nativeToScVal(cid, { type: "string" })],
      }),
    )
    .setTimeout(timeout)
    .build();
  tx.sign(source);
  return tx;
}

describe("validateSignedTransaction", () => {
  it("accepts the Tansu call the dapp is about to send", () => {
    expect(() =>
      validateSignedTransaction(invokeTx().toXDR(), CID, ENV),
    ).not.toThrow();
  });

  it("rejects what is not a signed transaction", () => {
    for (const xdr of ["", "not-valid-xdr"]) {
      expect(() => validateSignedTransaction(xdr, CID, ENV)).toThrow(
        "Transaction signature is invalid",
      );
    }
  });

  it("rejects an envelope another key signed", () => {
    const tx = invokeTx();
    tx.signatures.length = 0;
    tx.sign(Keypair.random());
    expect(() => validateSignedTransaction(tx.toXDR(), CID, ENV)).toThrow(
      "Transaction signature is invalid",
    );
  });

  it("rejects another network's envelope", () => {
    expect(() =>
      validateSignedTransaction(
        invokeTx({ network: Networks.PUBLIC }).toXDR(),
        CID,
        ENV,
      ),
    ).toThrow("Transaction signature is invalid");
  });

  it("rejects an envelope that never expires", () => {
    expect(() =>
      validateSignedTransaction(invokeTx({ timeout: 0 }).toXDR(), CID, ENV),
    ).toThrow("expire within the hour");
  });

  it("rejects a call to another contract, or without the CID", () => {
    const other = StrKey.encodeContract(Buffer.alloc(32, 2));
    for (const tx of [invokeTx({ contract: other }), invokeTx({ cid: "x" })]) {
      expect(() => validateSignedTransaction(tx.toXDR(), CID, ENV)).toThrow(
        `does not record ${CID} with Tansu`,
      );
    }
  });
});

describe("calculateCidFromCar", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const car = (roots: unknown[]) =>
    vi.spyOn(CarReader, "fromBytes").mockResolvedValue({
      getRoots: async () => roots,
      blocks: (async function* () {})(),
    } as any);
  const blob = new Blob([""], { type: "application/vnd.ipld.car" });

  it("throws for CAR with no root", async () => {
    car([]);
    await expect(calculateCidFromCar(blob)).rejects.toThrow(
      "CAR file has no declared root",
    );
  });

  it("throws for CAR with several roots", async () => {
    car([{ toString: () => "a" }, { toString: () => "b" }]);
    await expect(calculateCidFromCar(blob)).rejects.toThrow("one root");
  });

  it("returns root CID when present", async () => {
    car([{ toString: () => "bafyrei123" }]);
    expect(await calculateCidFromCar(blob)).toBe("bafyrei123");
  });
});

describe("buildUploadBlob", () => {
  it("creates valid blob from base64 CAR", () => {
    const blob = buildUploadBlob("Y3ViZQo=");
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
  const HASH = "a".repeat(64);

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

  it("accepts a successful Tansu call that records the CID", async () => {
    const fetchMock = mockRpc({
      status: "SUCCESS",
      envelopeXdr: invokeTx().toXDR(),
    });
    await expect(
      validateSubmittedTransaction(HASH, CID, ENV),
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
      invokeTx(),
      Networks.TESTNET,
    );
    mockRpc({ status: "SUCCESS", envelopeXdr: feeBump.toXDR() });
    await expect(
      validateSubmittedTransaction(HASH, CID, ENV),
    ).resolves.toBeUndefined();
  });

  it("rejects a call that does not record the CID with Tansu", async () => {
    const other = StrKey.encodeContract(Buffer.alloc(32, 2));
    for (const tx of [
      invokeTx({ cid: "bafyreiother" }),
      invokeTx({ contract: other }),
    ]) {
      mockRpc({ status: "SUCCESS", envelopeXdr: tx.toXDR() });
      await expect(
        validateSubmittedTransaction(HASH, CID, ENV),
      ).rejects.toThrow(`does not record ${CID}`);
    }
  });

  it.each(["FAILED", "NOT_FOUND"])(
    "rejects a %s transaction",
    async (status) => {
      mockRpc({ status });
      await expect(
        validateSubmittedTransaction(HASH, CID, ENV),
      ).rejects.toThrow(`did not succeed on-chain (${status})`);
    },
  );

  it("rejects when no RPC is configured", async () => {
    await expect(
      validateSubmittedTransaction(HASH, CID, {
        ...ENV,
        SOROBAN_RPC_URL: undefined,
      }),
    ).rejects.toThrow("not configured");
  });

  it("rejects a malformed hash", async () => {
    await expect(
      validateSubmittedTransaction("not-a-hash", CID, ENV),
    ).rejects.toThrow("Invalid transaction hash");
  });
});

describe("CORS", () => {
  const preflight = (origin: string) =>
    worker.fetch(
      new Request("https://ipfs.example", {
        method: "OPTIONS",
        headers: { Origin: origin },
      }),
      { ...ENV, FILEBASE_TOKEN: "" },
      { waitUntil: () => {} },
    );

  it("answers the dapp's origins, deploy previews included", async () => {
    for (const origin of [
      "https://app.tansu.dev",
      "https://deploy-preview-42--staging-tansu.netlify.app",
    ]) {
      const response = await preflight(origin);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    }
  });

  it("answers no look-alike", async () => {
    for (const origin of [
      "https://deploy-preview-42--staging-tansuXnetlify.app",
      "https://deploy-preview-a.evil.example--staging-tansu.netlify.app",
    ]) {
      const response = await preflight(origin);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    }
  });
});
