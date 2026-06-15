import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Buffer } from "buffer";
import * as StellarSdk from "@stellar/stellar-sdk";

const { xdr, Address } = StellarSdk;

function scvToB64(scVal: StellarSdk.xdr.ScVal): string {
  return scVal.toXDR("base64");
}

function scvAddress(address: string): StellarSdk.xdr.ScVal {
  return Address.fromString(address).toScVal();
}

function makeOperation(
  method: string,
  args: StellarSdk.xdr.ScVal[],
  overrides: {
    txHash?: string;
    createdAt?: string;
    resultXdr?: string;
  } = {},
) {
  const contractAddr = scvAddress(
    "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
  );
  const methodSym = xdr.ScVal.scvSymbol(method);
  const argsVec = xdr.ScVal.scvVec(args);

  return {
    type: "invoke_host_function",
    transaction_hash: overrides.txHash ?? "a".repeat(64),
    created_at: overrides.createdAt ?? "2026-01-15T12:00:00Z",
    parameters: [
      { xdr: scvToB64(contractAddr) },
      { xdr: scvToB64(methodSym) },
      { xdr: scvToB64(argsVec) },
    ],
    result_xdr: overrides.resultXdr ?? undefined,
  };
}

function makeRegisterOp(name: string, url: string) {
  const args = [
    scvAddress("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF"),
    xdr.ScVal.scvString(name),
    xdr.ScVal.scvVec([]),
    xdr.ScVal.scvString(url),
    xdr.ScVal.scvString("bafyabc123"),
  ];

  const projectKey = Buffer.from(
    Array.from({ length: 32 }, (_, i) => (i + 1) % 256),
  );
  const resultScVal = xdr.ScVal.scvBytes(projectKey);

  return makeOperation("register", args, {
    txHash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    resultXdr: scvToB64(resultScVal),
  });
}

function makeCommitOp(projectKeyHex: string, hash: string) {
  const keyBuf = Buffer.from(projectKeyHex, "hex");
  const args = [
    scvAddress("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF"),
    xdr.ScVal.scvBytes(keyBuf),
    xdr.ScVal.scvString(hash),
  ];
  return makeOperation("commit", args);
}

function makeHorizonResponse(records: unknown[]) {
  return {
    _embedded: { records },
  };
}

describe("OnChainActivityService", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let mod: typeof import("../../../src/service/OnChainActivityService");

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv("PUBLIC_HORIZON_URL", "https://horizon-testnet.stellar.org");
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    mod = await import("../../../src/service/OnChainActivityService");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("parses a register operation and extracts project name and project key", async () => {
    const records = [makeRegisterOp("myapp", "https://github.com/org/myapp")];
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(makeHorizonResponse(records)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const actions = await mod.fetchOnChainActions("GTESTACCOUNT");
    expect(actions).toHaveLength(1);

    const action = actions[0]!;
    expect(action.method).toBe("register");
    expect(action.projectName).toBe("myapp");
    expect(action.projectKey).toBeTruthy();
    expect(action.details.name).toBe("myapp");
    expect(action.details.ipfs).toBe("bafyabc123");
  });

  it("parses a commit operation and extracts project key and hash", async () => {
    const projectKeyHex =
      "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
    const records = [makeCommitOp(projectKeyHex, "abc123def456")];
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(makeHorizonResponse(records)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const actions = await mod.fetchOnChainActions("GTESTACCOUNT");
    expect(actions).toHaveLength(1);

    const action = actions[0]!;
    expect(action.method).toBe("commit");
    expect(action.projectKey?.toLowerCase()).toBe(projectKeyHex.toLowerCase());
    expect(action.details.hash).toBe("abc123def456");
  });

  it("filters out operations that are not invoke_host_function", async () => {
    const records = [
      {
        type: "payment",
        transaction_hash: "x".repeat(64),
        created_at: "2026-01-01T00:00:00Z",
        parameters: [],
      },
      {
        type: "create_account",
        transaction_hash: "y".repeat(64),
        created_at: "2026-01-01T00:00:00Z",
        parameters: [],
      },
    ];
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(makeHorizonResponse(records)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const actions = await mod.fetchOnChainActions("GTESTACCOUNT");
    expect(actions).toHaveLength(0);
  });

  it("filters out operations with non-member methods", async () => {
    const unknownMethod = xdr.ScVal.scvSymbol("unknown_fn");
    const contractAddr = scvAddress(
      "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
    );
    const argsVec = xdr.ScVal.scvVec([]);
    const record = {
      type: "invoke_host_function",
      transaction_hash: "c".repeat(64),
      created_at: "2026-01-01T00:00:00Z",
      parameters: [
        { xdr: scvToB64(contractAddr) },
        { xdr: scvToB64(unknownMethod) },
        { xdr: scvToB64(argsVec) },
      ],
    };

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(makeHorizonResponse([record])), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const actions = await mod.fetchOnChainActions("GTESTACCOUNT");
    expect(actions).toHaveLength(0);
  });

  it("resolves project names across operations via shared cache", async () => {
    const registerOp = makeRegisterOp(
      "shared-app",
      "https://github.com/org/shared-app",
    );
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(makeHorizonResponse([registerOp])), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await mod.fetchOnChainActions("ACCT_A");

    const expectedKey =
      "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20";

    const commitOp = makeCommitOp(expectedKey, "cached-hash");
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(makeHorizonResponse([commitOp])), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const actions = await mod.fetchOnChainActions("ACCT_B");

    expect(actions).toHaveLength(1);
    expect(actions[0]!.method).toBe("commit");
    expect(actions[0]!.projectName).toBe("shared-app");
    expect(actions[0]!.details.hash).toBe("cached-hash");
  });

  it("deduplicates multiple calls for the same account (cached promise)", async () => {
    const records = [makeRegisterOp("myapp", "https://github.com/org/myapp")];
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(makeHorizonResponse(records)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const [result1, result2] = await Promise.all([
      mod.fetchOnChainActions("SAMEACCOUNT"),
      mod.fetchOnChainActions("SAMEACCOUNT"),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result1).toEqual(result2);
  });

  it("throws on non-ok Horizon response", async () => {
    fetchMock.mockResolvedValue(
      new Response("Not Found", { status: 404, statusText: "Not Found" }),
    );
    await expect(mod.fetchOnChainActions("BADACCOUNT")).rejects.toThrow(
      "Horizon error 404",
    );
  });

  it("seedProjectNameCache populates the name cache before fetch", async () => {
    const seededKey =
      "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd";
    mod.seedProjectNameCache({ [seededKey]: "pre-seeded-project" });

    const commitOp = makeCommitOp(seededKey, "seedhash");
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(makeHorizonResponse([commitOp])), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const actions = await mod.fetchOnChainActions("SEEDED_ACCOUNT");
    expect(actions).toHaveLength(1);
    expect(actions[0]!.projectName).toBe("pre-seeded-project");
  });
});
