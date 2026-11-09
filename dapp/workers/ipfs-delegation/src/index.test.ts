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
  pinStatus,
  simulateSignedTransaction,
  validateSignedTransaction,
  validateSubmittedTransaction,
  validateUploadRequest,
  calculateCidFromCar,
  buildUploadBlob,
} from "./index";
import {
  QUOTA_BYTES,
  QUOTA_UPLOADS,
  QUOTA_WINDOW_MS,
  UploadQuota,
} from "./quota";

const CID = "bafyreitestcid";
const TANSU = StrKey.encodeContract(Buffer.alloc(32, 1));
const ENV = {
  NETWORK_PASSPHRASE: Networks.TESTNET,
  TANSU_CONTRACT_ID: TANSU,
  SOROBAN_RPC_URL: "https://rpc.example",
  MAX_CAR_BYTES: String(10 * 1024 * 1024),
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
    const source = Keypair.random();
    const fetchMock = mockRpc({
      status: "SUCCESS",
      envelopeXdr: invokeTx({ source }).toXDR(),
    });
    await expect(validateSubmittedTransaction(HASH, CID, ENV)).resolves.toBe(
      source.publicKey(),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({
      method: "getTransaction",
      params: { hash: HASH },
    });
  });

  it("accepts a fee-bumped call that records the CID", async () => {
    const source = Keypair.random();
    const feeBump = TransactionBuilder.buildFeeBumpTransaction(
      Keypair.random(),
      "200",
      invokeTx({ source }),
      Networks.TESTNET,
    );
    mockRpc({ status: "SUCCESS", envelopeXdr: feeBump.toXDR() });
    await expect(validateSubmittedTransaction(HASH, CID, ENV)).resolves.toBe(
      source.publicKey(),
    );
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

describe("UploadQuota", () => {
  const MB = 1024 * 1024;

  function account() {
    const data = new Map<string, unknown>();
    const quota = new UploadQuota({
      storage: {
        get: async (key) => data.get(key) as any,
        put: async (key, value) => void data.set(key, structuredClone(value)),
      },
    });
    return async (action: "reserve" | "release", cid: string, bytes: number) =>
      (await (
        await quota.fetch(
          new Request("https://quota", {
            method: "POST",
            body: JSON.stringify({ action, cid, bytes }),
          }),
        )
      ).json()) as { ok: boolean; retryAfter?: number };
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows a number of uploads a day", async () => {
    const ask = account();
    for (let i = 0; i < QUOTA_UPLOADS; i += 1) {
      expect((await ask("reserve", `cid${i}`, 1)).ok).toBe(true);
    }
    expect((await ask("reserve", "one-more", 1)).ok).toBe(false);
  });

  it("allows a number of bytes a day", async () => {
    const ask = account();
    expect((await ask("reserve", "a", QUOTA_BYTES - MB)).ok).toBe(true);
    expect((await ask("reserve", "b", 2 * MB)).ok).toBe(false);
    expect((await ask("reserve", "c", MB)).ok).toBe(true);
  });

  it("charges a CID once, so a retry is free", async () => {
    const ask = account();
    await ask("reserve", "a", QUOTA_BYTES);
    expect((await ask("reserve", "a", QUOTA_BYTES)).ok).toBe(true);
    expect((await ask("reserve", "b", 1)).ok).toBe(false);
  });

  it("gives back what a failed upload reserved", async () => {
    const ask = account();
    await ask("reserve", "a", QUOTA_BYTES);
    await ask("release", "a", QUOTA_BYTES);
    expect((await ask("reserve", "b", QUOTA_BYTES)).ok).toBe(true);
  });

  it("starts over a day after the first upload, and says when", async () => {
    vi.useFakeTimers();
    const ask = account();
    await ask("reserve", "a", QUOTA_BYTES);
    vi.advanceTimersByTime(QUOTA_WINDOW_MS - 60_000);
    expect(await ask("reserve", "b", 1)).toEqual({ ok: false, retryAfter: 60 });
    vi.advanceTimersByTime(60_000);
    expect((await ask("reserve", "b", 1)).ok).toBe(true);
  });
});

describe("upload", () => {
  const SOURCE = Keypair.random();
  const CAR = "Y3ViZQo=";

  let calls: string[];
  let simulation: Record<string, unknown>;
  let filebaseStatus: number;
  /** What the bucket says about a CID: pinned, absent, or not answering. */
  let pin: "pinned" | "absent" | "down";
  /** The CID the landed transaction records. */
  let landedCid: string;

  /** One quota per account, as the Durable Object namespace makes them. */
  function quotas() {
    const objects = new Map<string, (request: Request) => Promise<Response>>();
    return {
      idFromName: (name: string) => name,
      get: (id: string) => {
        if (!objects.has(id)) {
          const data = new Map<string, unknown>();
          const quota = new UploadQuota({
            storage: {
              get: async (key) => data.get(key) as any,
              put: async (key, value) =>
                void data.set(key, structuredClone(value)),
            },
          });
          objects.set(id, (request) => quota.fetch(request));
        }
        return {
          fetch: (url: string, init: RequestInit) =>
            objects.get(id)!(new Request(url, init)),
        };
      },
    };
  }

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
    pin = "absent";
    landedCid = CID;
    env = {
      ...ENV,
      FILEBASE_TOKEN: "token",
      UPLOAD_QUOTA: quotas(),
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
                  : {
                      status: "SUCCESS",
                      envelopeXdr: invokeTx({
                        cid: landedCid,
                        source: SOURCE,
                      }).toXDR(),
                    },
            }),
          );
        }
        if (url.startsWith("https://rpc.filebase.io/api/v0/pin/ls")) {
          calls.push("pin-ls");
          if (pin === "down") return new Response("", { status: 503 });
          return pin === "pinned"
            ? Response.json({ Keys: { [landedCid]: { Type: "recursive" } } })
            : Response.json({ Message: "is not pinned" }, { status: 500 });
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
    expect(calls).toEqual(["simulateTransaction", "pin-ls", "filebase"]);
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

  it("stops an account that reached its quota, not the others", async () => {
    for (let i = 0; i < QUOTA_UPLOADS; i += 1) {
      const cid = `cid${i}`;
      vi.mocked(CarReader.fromBytes).mockResolvedValue({
        getRoots: async () => [{ toString: () => cid }],
      } as any);
      const response = await upload({
        cid,
        signedTxXdr: invokeTx({ cid, source: SOURCE }).toXDR(),
      });
      expect(response.status).toBe(200);
    }
    vi.mocked(CarReader.fromBytes).mockResolvedValue({
      getRoots: async () => [{ toString: () => CID }],
    } as any);
    calls = [];
    const response = await upload(signed());
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(calls).toEqual(["simulateTransaction", "pin-ls"]);

    expect((await upload(signed(Keypair.random()))).status).toBe(200);
  });

  it("gives the quota back when Filebase fails", async () => {
    vi.useFakeTimers();
    filebaseStatus = 500;
    const failing = upload(signed());
    await vi.runAllTimersAsync();
    expect((await failing).status).toBe(502);

    filebaseStatus = 200;
    const body = signed();
    const retry = await upload(body);
    expect(retry.status).toBe(200);
  });

  /** The CAR and the landed transaction both name `cid`. */
  const useCid = (cid: string) => {
    landedCid = cid;
    vi.mocked(CarReader.fromBytes).mockResolvedValue({
      getRoots: async () => [{ toString: () => cid }],
    } as any);
  };

  it("takes a landed transaction without simulating it", async () => {
    const response = await upload({ txHash: "a".repeat(64) });
    expect(response.status).toBe(200);
    expect(calls).toEqual(["getTransaction", "pin-ls", "filebase"]);
  });

  it("counts a landed transaction against its source account", async () => {
    for (let i = 0; i < QUOTA_UPLOADS; i += 1) {
      useCid(`cid${i}`);
      const response = await upload({
        cid: `cid${i}`,
        txHash: "a".repeat(64),
      });
      expect(response.status).toBe(200);
    }
    useCid("one-more");
    const response = await upload({ cid: "one-more", txHash: "a".repeat(64) });
    expect(response.status).toBe(429);
  });

  it("does not upload or count what the bucket already pins", async () => {
    pin = "pinned";
    for (let i = 0; i < QUOTA_UPLOADS + 1; i += 1) {
      const response = await upload({ txHash: "a".repeat(64) });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        success: true,
        alreadyPinned: true,
      });
    }
    expect(calls).not.toContain("filebase");
  });

  it("uploads when the bucket does not answer about the CID", async () => {
    pin = "down";
    const response = await upload({ txHash: "a".repeat(64) });
    expect(response.status).toBe(200);
    expect(calls).toContain("filebase");
  });

  it("refuses a CAR over the cap", async () => {
    env = { ...env, MAX_CAR_BYTES: "3" };
    const response = await upload({ txHash: "a".repeat(64) });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "Invalid CAR body" });
    expect(calls).toEqual(["getTransaction"]);
  });

  describe("/health", () => {
    const health = () =>
      worker.fetch(new Request("https://ipfs.example/health"), env, {
        waitUntil: () => {},
      });

    // The answer is kept for a while: every test starts well after the last.
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(Date.now() + 3_600_000 * ++healthTest);
    });

    it("says ok while Filebase answers", async () => {
      expect((await health()).status).toBe(200);
      expect(calls).toEqual(["pin-ls"]);
    });

    it("says 503 when Filebase does not answer", async () => {
      pin = "down";
      const response = await health();
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ ok: false });
    });

    it("asks Filebase once in a while", async () => {
      await health();
      await health();
      expect(calls).toEqual(["pin-ls"]);
    });
  });
});

let healthTest = 0;

describe("pinStatus", () => {
  const answer = (response: Response) =>
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("knows a pinned CID, an unpinned one, and when it cannot know", async () => {
    answer(Response.json({ Keys: { [CID]: { Type: "recursive" } } }));
    expect(await pinStatus(CID, { FILEBASE_TOKEN: "t" })).toBe("pinned");
    answer(
      Response.json({ Message: "path 'x' is not pinned" }, { status: 500 }),
    );
    expect(await pinStatus(CID, { FILEBASE_TOKEN: "t" })).toBe("absent");
    answer(Response.json({ Message: "invalid token" }, { status: 401 }));
    expect(await pinStatus(CID, { FILEBASE_TOKEN: "t" })).toBe("unknown");
    answer(Response.json({ Message: "slow down" }, { status: 429 }));
    expect(await pinStatus(CID, { FILEBASE_TOKEN: "t" })).toBe("unknown");
    // Another wording of "not pinned" must not make the bucket look down.
    answer(Response.json({ Message: "no such pin" }, { status: 404 }));
    expect(await pinStatus(CID, { FILEBASE_TOKEN: "t" })).toBe("absent");
    answer(Response.json({ Message: "internal error" }, { status: 500 }));
    expect(await pinStatus(CID, { FILEBASE_TOKEN: "t" })).toBe("unknown");
    answer(new Response("<html>", { status: 502 }));
    expect(await pinStatus(CID, { FILEBASE_TOKEN: "t" })).toBe("unknown");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await pinStatus(CID, { FILEBASE_TOKEN: "t" })).toBe("unknown");
  });
});
