import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  Account,
  Keypair,
  Networks,
  Operation,
  StrKey,
  TransactionBuilder,
  nativeToScVal,
  type xdr,
} from "@stellar/stellar-sdk";
import worker, {
  type Env,
  pinStatus,
  uploadActor,
  validateSubmittedTransaction,
  validateUploadRequest,
} from "./index";
import { verifiedRoot } from "./car";
import {
  QUOTA_BYTES,
  QUOTA_UPLOADS,
  QUOTA_WINDOW_MS,
  UploadQuota,
} from "./quota";

vi.mock("./car", () => ({ verifiedRoot: vi.fn() }));

const CID = "bafyreitestcid";
const TANSU = StrKey.encodeContract(Buffer.alloc(32, 1));
const ENV = {
  NETWORK_PASSPHRASE: Networks.TESTNET,
  TANSU_CONTRACT_ID: TANSU,
  SOROBAN_RPC_URL: "https://rpc.example",
  MAX_CAR_BYTES: String(10 * 1024 * 1024),
};

/** A Tansu call recording `cid`, authorized by `actor` (the source if absent). */
function invokeTx({
  cid = CID,
  contract = TANSU,
  fn = "add_member",
  args,
  source = Keypair.random(),
  actor = source.publicKey(),
}: {
  cid?: string;
  contract?: string;
  fn?: string;
  args?: xdr.ScVal[];
  source?: Keypair;
  actor?: string;
} = {}) {
  const tx = new TransactionBuilder(new Account(source.publicKey(), "1"), {
    fee: "100",
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.invokeContractFunction({
        contract,
        function: fn,
        args: args ?? [
          nativeToScVal(actor, { type: "address" }),
          nativeToScVal(cid, { type: "string" }),
        ],
      }),
    )
    .setTimeout(300)
    .build();
  tx.sign(source);
  return tx;
}

describe("uploadActor", () => {
  const call = (tx: ReturnType<typeof invokeTx>, cid = CID) =>
    uploadActor(tx, cid, TANSU);
  const text = (value: string) => nativeToScVal(value, { type: "string" });

  it("is the address that authorized the call, not the source", () => {
    const actor = Keypair.random().publicKey();
    expect(call(invokeTx({ actor }))).toBe(actor);
    // A smart account is a contract address.
    const smart = StrKey.encodeContract(Buffer.alloc(32, 9));
    expect(call(invokeTx({ actor: smart }))).toBe(smart);
  });

  it("knows where each function takes its CID", () => {
    // The contract's signatures, written out (env left out): the CID is the
    // argument named `cid`, `ipfs`, `meta` or `reason`.
    const address = () =>
      nativeToScVal(Keypair.random().publicKey(), { type: "address" });
    const signatures: Record<string, string[]> = {
      add_member: [
        "member_address",
        "meta",
        "git_identity",
        "git_pubkey",
        "git_sig",
      ],
      update_member: [
        "member_address",
        "meta",
        "git_identity",
        "git_pubkey",
        "git_sig",
      ],
      register: [
        "maintainer",
        "name",
        "maintainers",
        "url",
        "ipfs",
        "min_voting_period",
      ],
      update_config: [
        "maintainer",
        "key",
        "maintainers",
        "url",
        "ipfs",
        "min_voting_period",
      ],
      set_evidence: ["maintainer", "project_key", "commit_hash", "kind", "cid"],
      create_proposal: [
        "proposer",
        "project_key",
        "title",
        "ipfs",
        "voting_ends_at",
      ],
      veto: ["maintainer", "project_key", "proposal_id", "reason"],
    };
    for (const [fn, names] of Object.entries(signatures)) {
      const args = names.map((name, i) => (i === 0 ? address() : text(name)));
      const cid = names.find((name) =>
        ["meta", "ipfs", "cid", "reason"].includes(name),
      )!;
      args[names.indexOf(cid)] = text(CID);
      expect(call(invokeTx({ fn, args })), fn).toBeDefined();
      // Any other string argument is not the CID.
      expect(call(invokeTx({ fn, args }), "title"), fn).toBeUndefined();
    }
  });

  it("refuses a CID anywhere else", () => {
    const actor = nativeToScVal(Keypair.random().publicKey(), {
      type: "address",
    });
    for (const args of [
      [actor, text("x"), text(CID)],
      [actor, nativeToScVal([CID], { type: "string" }), text("x")],
      [actor, nativeToScVal({ meta: CID })],
    ]) {
      expect(call(invokeTx({ args }))).toBeUndefined();
    }
  });

  it("refuses another function, another contract and another CID", () => {
    const other = StrKey.encodeContract(Buffer.alloc(32, 2));
    for (const tx of [
      invokeTx({ fn: "vote" }),
      invokeTx({ contract: other }),
      invokeTx({ cid: "bafyreiother" }),
    ]) {
      expect(call(tx)).toBeUndefined();
    }
  });

  it("refuses a call whose first argument is not an address", () => {
    expect(call(invokeTx({ args: [text("x"), text(CID)] }))).toBeUndefined();
  });
});

describe("validateUploadRequest", () => {
  it("wants a CID, a CAR and a transaction hash", () => {
    expect(() =>
      validateUploadRequest({ cid: "c", car: "a", txHash: "h" }),
    ).not.toThrow();
    for (const body of [
      { cid: "c", car: "a" },
      { cid: "c", txHash: "h" },
      { car: "a", txHash: "h" },
    ]) {
      expect(() => validateUploadRequest(body as any)).toThrow(
        "Missing required fields",
      );
    }
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

  it("rejects a failed transaction", async () => {
    mockRpc({ status: "FAILED" });
    await expect(validateSubmittedTransaction(HASH, CID, ENV)).rejects.toThrow(
      "did not succeed on-chain (FAILED)",
    );
  });

  describe("an RPC that does not know the transaction", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    const answers = (statuses: string[]) => {
      vi.useFakeTimers();
      const fetchMock = vi.fn(async () => {
        const status = statuses.shift() ?? "NOT_FOUND";
        return Response.json({
          result: {
            status,
            envelopeXdr: invokeTx().toXDR(),
          },
        });
      });
      vi.stubGlobal("fetch", fetchMock);
      return fetchMock;
    };

    it("is asked again, for a node that lags", async () => {
      const fetchMock = answers(["NOT_FOUND", "NOT_FOUND", "SUCCESS"]);
      const pending = validateSubmittedTransaction(HASH, CID, ENV);
      await vi.runAllTimersAsync();
      await expect(pending).resolves.toMatch(/^G/);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("is believed after a few tries", async () => {
      const fetchMock = answers([]);
      const pending = validateSubmittedTransaction(HASH, CID, ENV);
      const rejected = expect(pending).rejects.toThrow(
        "did not succeed on-chain (NOT_FOUND)",
      );
      await vi.runAllTimersAsync();
      await rejected;
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });
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
  /** The relayer that pays for every landed transaction. */
  const RELAYER = Keypair.random();
  const ACTOR = Keypair.random().publicKey();
  const HASH = "a".repeat(64);
  const CAR = "Y3ViZQo=";

  let calls: string[];
  let filebaseStatus: number;
  /** Who is allowed to ask: the rate limiter's answer. */
  let allowed: boolean;
  /** The address that authorized the landed transaction. */
  let landedActor: string;
  /** How many times the RPC says "not found" before the transaction. */
  let notFound: number;
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

  const upload = (body: Record<string, unknown> = {}) =>
    worker.fetch(
      new Request("https://ipfs.example", {
        method: "POST",
        body: JSON.stringify({ cid: CID, car: CAR, txHash: HASH, ...body }),
      }),
      env,
      { waitUntil: () => {} },
    );

  beforeEach(() => {
    calls = [];
    filebaseStatus = 200;
    pin = "absent";
    landedCid = CID;
    landedActor = ACTOR;
    allowed = true;
    notFound = 0;
    vi.mocked(verifiedRoot).mockResolvedValue(CID);
    env = {
      ...ENV,
      FILEBASE_TOKEN: "token",
      UPLOAD_QUOTA: quotas(),
      RATE_LIMIT: { limit: vi.fn(async () => ({ success: allowed })) },
    } as unknown as Env;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        if (url === ENV.SOROBAN_RPC_URL) {
          const { method } = JSON.parse(init.body as string);
          calls.push(method);
          return Response.json({
            result:
              notFound-- > 0
                ? { status: "NOT_FOUND" }
                : {
                    status: "SUCCESS",
                    envelopeXdr: invokeTx({
                      cid: landedCid,
                      source: RELAYER,
                      actor: landedActor,
                    }).toXDR(),
                  },
          });
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

  /** The CAR and the landed transaction both name `cid`. */
  const useCid = (cid: string) => {
    landedCid = cid;
    vi.mocked(verifiedRoot).mockResolvedValue(cid);
  };

  it("pins what a landed transaction recorded", async () => {
    const response = await upload();
    expect(response.status).toBe(200);
    expect(calls).toEqual(["getTransaction", "pin-ls", "filebase"]);
  });

  it("asks nothing of the network for junk", async () => {
    await upload({ txHash: "nope" });
    await upload({ txHash: "" });
    await upload({ car: "" });
    expect(calls).toEqual([]);
  });

  it("decodes no CAR before the transaction checks out", async () => {
    landedCid = "bafyreiother";
    expect((await upload()).status).toBe(400);
    expect(verifiedRoot).not.toHaveBeenCalled();
  });

  it("refuses a CAR that is not what its CID names", async () => {
    vi.mocked(verifiedRoot).mockRejectedValue(
      new Error("Block x does not hash to its CID"),
    );
    const response = await upload();
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: expect.stringContaining("does not hash"),
    });
    expect(calls).toEqual(["getTransaction"]);
  });

  it("refuses a CAR whose root is not the CID", async () => {
    vi.mocked(verifiedRoot).mockResolvedValue("bafyreiother");
    const response = await upload();
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: expect.stringContaining("CID mismatch"),
    });
  });

  it("stops an address that reached its quota, not the others", async () => {
    for (let i = 0; i < QUOTA_UPLOADS; i += 1) {
      useCid(`cid${i}`);
      expect((await upload({ cid: `cid${i}` })).status).toBe(200);
    }
    useCid(CID);
    calls = [];
    const response = await upload();
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(calls).toEqual(["getTransaction", "pin-ls"]);

    // Another user of the same relayer has a quota of their own.
    landedActor = Keypair.random().publicKey();
    expect((await upload()).status).toBe(200);
  });

  it("gives the quota back when Filebase fails", async () => {
    vi.useFakeTimers();
    filebaseStatus = 500;
    const failing = upload();
    await vi.runAllTimersAsync();
    expect((await failing).status).toBe(502);

    filebaseStatus = 200;
    expect((await upload()).status).toBe(200);
  });

  it("asks the RPC again for a transaction it does not know yet", async () => {
    vi.useFakeTimers();
    notFound = 2;
    const pending = upload();
    await vi.runAllTimersAsync();
    expect((await pending).status).toBe(200);
    expect(calls.filter((call) => call === "getTransaction")).toHaveLength(3);
  });

  it("asks the RPC again, and says 502 when it never answers", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.mocked(fetch);
    const answer = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url, init) =>
      url === ENV.SOROBAN_RPC_URL
        ? Promise.reject(new DOMException("timed out", "TimeoutError"))
        : answer(url, init),
    );
    const pending = upload();
    await vi.runAllTimersAsync();
    const response = await pending;
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      error: expect.stringContaining("Soroban RPC did not answer"),
    });
    const asked = fetchMock.mock.calls.filter(
      ([url]) => url === ENV.SOROBAN_RPC_URL,
    );
    expect(asked).toHaveLength(3);
  });

  it("does not upload or count what the bucket already pins", async () => {
    pin = "pinned";
    for (let i = 0; i < QUOTA_UPLOADS + 1; i += 1) {
      const response = await upload();
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
    const response = await upload();
    expect(response.status).toBe(200);
    expect(calls).toContain("filebase");
  });

  it("refuses a CAR over the cap", async () => {
    env = { ...env, MAX_CAR_BYTES: "3" };
    const response = await upload();
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "Invalid CAR body" });
    expect(calls).toEqual(["getTransaction"]);
  });

  it("reads no more of a body than a CAR of the cap can take", async () => {
    env = { ...env, MAX_CAR_BYTES: "3" };
    const response = await upload({ car: "A".repeat(100_000) });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "Upload too large" });
    expect(calls).toEqual([]);
  });

  it("answers 429 to an address that asks too often, before reading", async () => {
    allowed = false;
    const response = await upload();
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(calls).toEqual([]);
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
