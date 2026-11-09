import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { packFilesToCar } from "../../../src/utils/ipfsFunctions";

describe("packFilesToCar", () => {
  it("returns CarPackResult with cid and carBlob for valid files", async () => {
    const mockFile = new File(["hello world"], "test.txt", {
      type: "text/plain",
    });
    const result = await packFilesToCar([mockFile]);
    expect(result).toHaveProperty("cid");
    expect(result).toHaveProperty("carBlob");
    expect(result.cid).toMatch(/^(bafy|Qm)/);
    expect(result.carBlob).toBeInstanceOf(Blob);
    expect(result.carBlob.type).toBe("application/vnd.ipld.car");
  });

  it("returns different CIDs for different content", async () => {
    const file1 = new File(["content A"], "a.txt", { type: "text/plain" });
    const file2 = new File(["content B"], "b.txt", { type: "text/plain" });
    const result1 = await packFilesToCar([file1]);
    const result2 = await packFilesToCar([file2]);
    expect(result1.cid).not.toBe(result2.cid);
  });
});

describe("remembered IPFS misses", () => {
  const CID = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
  const NO_PROVIDERS =
    "Unable to retrieve content within timeout period: no providers found for the CID (phase: provider discovery)";

  let fetchMock: ReturnType<typeof vi.fn>;

  function memoryStorage(): Storage {
    const data = new Map<string, string>();
    return {
      get length() {
        return data.size;
      },
      clear: () => data.clear(),
      getItem: (key) => data.get(key) ?? null,
      key: (index) => [...data.keys()][index] ?? null,
      removeItem: (key) => void data.delete(key),
      setItem: (key, value) => void data.set(key, String(value)),
    };
  }

  /** A fresh module instance, as after a reload. */
  async function load() {
    vi.resetModules();
    return import("../../../src/utils/ipfsFunctions");
  }

  function errorOf(promise: Promise<unknown>) {
    return promise.then(
      () => {
        throw new Error("expected a rejection");
      },
      (error: unknown) => error as Error & Record<string, unknown>,
    );
  }

  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage());
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("PUBLIC_DELEGATION_API_URL", "https://ipfs.example.test");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("asks the gateway once for a CID nobody provides", async () => {
    fetchMock.mockResolvedValue(new Response(NO_PROVIDERS, { status: 504 }));
    const ipfs = await load();

    const first = await errorOf(ipfs.fetchFromIpfs(CID, "/tansu.toml"));
    expect(first).toMatchObject({
      name: "IpfsMissError",
      scope: "root",
      status: 504,
      fromCache: false,
    });
    const sibling = await errorOf(ipfs.fetchFromIpfs(CID, "README.md"));
    expect(sibling).toMatchObject({
      name: "IpfsMissError",
      path: "/README.md",
      fromCache: true,
    });

    // The query fails without asking, and keeps no answer: a re-upload
    // brings the CID back.
    const reloaded = await load();
    const client = new QueryClient();
    const query = reloaded.ipfsQuery(CID, "/tansu.toml");
    expect(await errorOf(client.query(query))).toMatchObject({
      name: "IpfsMissError",
      fromCache: true,
    });
    expect(client.getQueryData(query.queryKey)).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("hides only the missing file under a live CID", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith("/summary.md")
        ? new Response(null, { status: 404 })
        : new Response("# Proposal", { status: 200 }),
    );
    const ipfs = await load();

    // A missing file is an answer: null, remembered across a reload.
    const read = (path: string) =>
      new QueryClient().query(ipfs.ipfsQuery(CID, path));
    expect(await read("/summary.md")).toBeNull();
    expect(await read("summary.md")).toBeNull();
    expect(await read("/proposal.md")).toBe("# Proposal");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("asks again after a temporary failure", async () => {
    fetchMock
      .mockRejectedValueOnce(new DOMException("Aborted", "AbortError"))
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(new Response("Gateway Timeout", { status: 504 }))
      .mockResolvedValueOnce(new Response("# Proposal", { status: 200 }));
    const ipfs = await load();

    for (let i = 0; i < 3; i++) {
      const error = await errorOf(ipfs.fetchFromIpfs(CID, "/proposal.md"));
      expect(error.name).not.toBe("IpfsMissError");
    }
    expect(
      await new QueryClient().query(ipfs.ipfsQuery(CID, "/proposal.md")),
    ).toBe("# Proposal");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("waits once for a file the gateway never answers, for an hour", async () => {
    // The gateway holds the request until the deadline aborts it.
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) =>
          init.signal!.addEventListener("abort", () =>
            reject(init.signal!.reason),
          ),
        ),
    );
    const ipfs = await load();

    const stall = await errorOf(
      ipfs.fetchFromIpfs(CID, "/tansu.toml", { timeoutMs: 20 }),
    );
    expect(stall).toMatchObject({
      name: "IpfsMissError",
      scope: "path",
      status: 0,
      fromCache: false,
    });
    expect(stall.message).toContain("no answer");

    // Across a reload, the query fails at once: an error, not an absent
    // file, and nothing is retried.
    const reloaded = await load();
    const client = new QueryClient();
    const query = reloaded.ipfsQuery(CID, "/tansu.toml");
    expect(await errorOf(client.query(query))).toMatchObject({
      name: "IpfsMissError",
      fromCache: true,
    });
    expect(client.getQueryData(query.queryKey)).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // An hour later the gateway is asked again.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 61 * 60 * 1000);
    fetchMock.mockResolvedValueOnce(
      new Response("VERSION = 1", { status: 200 }),
    );
    expect(
      await (await reloaded.fetchFromIpfs(CID, "/tansu.toml")).text(),
    ).toBe("VERSION = 1");
    vi.useRealTimers();
  });

  it("forgets a CID's misses once it is uploaded", async () => {
    const upload = {
      cid: CID,
      carBlob: new Blob(["car"]),
      txHash: "a".repeat(64),
    };
    fetchMock.mockResolvedValue(new Response(NO_PROVIDERS, { status: 504 }));
    const ipfs = await load();
    await errorOf(ipfs.fetchFromIpfs(CID, "/tansu.toml"));

    // A failed upload (five tries, 1, 2, 4 and 8 s apart) keeps the miss.
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    fetchMock.mockClear();
    fetchMock.mockImplementation(async () =>
      Response.json({ error: "Filebase unavailable" }, { status: 502 }),
    );
    const failing = errorOf(ipfs.uploadToIpfsProxy(upload));
    await vi.advanceTimersByTimeAsync(15_000);
    const failed = await failing;
    vi.useRealTimers();
    expect(failed.message).toContain("Filebase unavailable");
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(await errorOf(ipfs.fetchFromIpfs(CID, "/tansu.toml"))).toMatchObject(
      { name: "IpfsMissError", fromCache: true },
    );

    fetchMock.mockResolvedValueOnce(Response.json({ cid: CID, success: true }));
    expect(await ipfs.uploadToIpfsProxy(upload)).toBe(CID);
    fetchMock.mockResolvedValueOnce(
      new Response("VERSION = 1", { status: 200 }),
    );
    expect(
      await new QueryClient().query(ipfs.ipfsQuery(CID, "/tansu.toml")),
    ).toBe("VERSION = 1");
  });
});

describe("checkIpfsService", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("asks the worker's /health before anyone signs", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const { checkIpfsService } =
      await import("../../../src/utils/ipfsFunctions");

    await expect(checkIpfsService()).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0]![0]).toBe(
      `${new URL(import.meta.env.PUBLIC_DELEGATION_API_URL).origin}/health`,
    );
  });

  it("says nothing was signed when the service or its storage is down", async () => {
    const { checkIpfsService } =
      await import("../../../src/utils/ipfsFunctions");
    for (const answer of [
      () => Promise.resolve(Response.json({ ok: false }, { status: 503 })),
      () => Promise.reject(new TypeError("Failed to fetch")),
    ]) {
      vi.stubGlobal("fetch", vi.fn(answer));
      await expect(checkIpfsService()).rejects.toThrow(
        "Nothing was signed or sent",
      );
    }
  });
});
