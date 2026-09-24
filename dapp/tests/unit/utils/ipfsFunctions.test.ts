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

  it("forgets a CID's misses once it is uploaded", async () => {
    const upload = {
      cid: CID,
      carBlob: new Blob(["car"]),
      signedTxXdr: "AAAA",
    };
    fetchMock.mockResolvedValue(new Response(NO_PROVIDERS, { status: 504 }));
    const ipfs = await load();
    await errorOf(ipfs.fetchFromIpfs(CID, "/tansu.toml"));

    // A failed upload (tried twice, 1 s apart) keeps the miss.
    fetchMock.mockImplementation(async () =>
      Response.json({ error: "Filebase unavailable" }, { status: 502 }),
    );
    const failed = await errorOf(ipfs.uploadToIpfsProxy(upload));
    expect(failed.message).toContain("Filebase unavailable");
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
