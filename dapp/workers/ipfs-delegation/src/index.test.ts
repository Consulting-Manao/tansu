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
  type Env,
  simulateSignedTransaction,
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
  source = Keypair.random(),
}: {
  cid?: string;
  contract?: string;
  network?: string;
  timeout?: number;
  source?: Keypair;
} = {}) {
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
      { ...ENV, FILEBASE_TOKEN: "" } as unknown as Env,
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

describe("simulateSignedTransaction", () => {
  const xdr = () => invokeTx().toXDR();

  function mockSimulation(result: Record<string, unknown>) {
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

  it("accepts a call the ledger would run, in enforce mode", async () => {
    const fetchMock = mockSimulation({ results: [{ auth: [] }] });
    const signed = xdr();
    await expect(
      simulateSignedTransaction(signed, ENV),
    ).resolves.toBeUndefined();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      method: "simulateTransaction",
      params: { transaction: signed, authMode: "enforce" },
    });
  });

  it("rejects a call the ledger would refuse", async () => {
    mockSimulation({ error: "HostError: Error(Auth, InvalidAction)" });
    await expect(simulateSignedTransaction(xdr(), ENV)).rejects.toThrow(
      "would not succeed on-chain: HostError",
    );
  });
});

describe("upload", () => {
  const SOURCE = Keypair.random();
  const CAR = "Y3ViZQo=";

  let calls: string[];
  let simulation: Record<string, unknown>;
  let filebaseStatus: number;

  let env: Env;

  const upload = (body: Record<string, unknown>) =>
    worker.fetch(
      new Request("https://ipfs.example", {
        method: "POST",
        body: JSON.stringify({ cid: CID, car: CAR, ...body }),
      }),
      env,
      { waitUntil: () => {} },
    );
  const signed = (source = SOURCE) => ({
    signedTxXdr: invokeTx({ source }).toXDR(),
  });

  beforeEach(() => {
    calls = [];
    simulation = { results: [{ auth: [] }] };
    filebaseStatus = 200;
    env = {
      ...ENV,
      FILEBASE_TOKEN: "token",
    } as unknown as Env;
    vi.spyOn(CarReader, "fromBytes").mockResolvedValue({
      getRoots: async () => [{ toString: () => CID }],
    } as any);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        if (url === ENV.SOROBAN_RPC_URL) {
          const { method } = JSON.parse(init.body as string);
          calls.push(method);
          return new Response(
            JSON.stringify({
              result:
                method === "simulateTransaction"
                  ? simulation
                  : { status: "SUCCESS", envelopeXdr: invokeTx().toXDR() },
            }),
          );
        }
        calls.push("filebase");
        const sent = (init.body as FormData).get("file") as File;
        return new Response(sent.name, { status: filebaseStatus });
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("pins a call the ledger would run", async () => {
    const response = await upload(signed());
    expect(response.status).toBe(200);
    expect(calls).toEqual(["simulateTransaction", "filebase"]);
  });

  it("pins nothing when the ledger would refuse the call", async () => {
    simulation = { error: "HostError: Error(Auth, InvalidAction)" };
    const response = await upload(signed());
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: expect.stringContaining("would not succeed on-chain"),
    });
    expect(calls).toEqual(["simulateTransaction"]);
  });

  it("does not ask the ledger about junk", async () => {
    await upload({ ...signed(), cid: "bafyreiother" });
    await upload({ ...signed(), car: "" });
    expect(calls).toEqual([]);
  });

  it("answers 502 when Filebase fails", async () => {
    vi.useFakeTimers();
    filebaseStatus = 500;
    const failing = upload(signed());
    await vi.runAllTimersAsync();
    expect((await failing).status).toBe(502);
  });

  it("takes a landed transaction without simulating it", async () => {
    const response = await upload({ txHash: "a".repeat(64) });
    expect(response.status).toBe(200);
    expect(calls).not.toContain("simulateTransaction");
  });
});
