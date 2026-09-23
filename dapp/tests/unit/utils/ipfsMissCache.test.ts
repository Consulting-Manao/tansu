import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const CID = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
const OTHER_CID = "QmT78zSuBmuS4z925WZfrqQ1qHaJ56DQaTfyMUF7F8ff5o";
const KEY = "tansu_ipfs_misses_v1";
const DAY = 24 * 60 * 60 * 1000;

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

/** A fresh module instance, as after a reload or in another tab. */
async function load() {
  vi.resetModules();
  return import("../../../src/utils/ipfsMissCache");
}

describe("ipfsMissCache", () => {
  let storage: Storage;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-23T12:00:00Z"));
    storage = memoryStorage();
    vi.stubGlobal("localStorage", storage);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("tells final gateway answers from temporary ones", async () => {
    const { classifyIpfsFailure } = await load();
    const noProviders =
      "Unable to retrieve content within timeout period: no providers found for the CID (phase: provider discovery)";

    expect(classifyIpfsFailure(504, noProviders)).toBe("root");
    for (const status of [400, 404, 410, 451]) {
      expect(classifyIpfsFailure(status, "")).toBe("path");
    }
    for (const status of [504, 500, 502, 503, 401, 403, 408, 429]) {
      expect(classifyIpfsFailure(status, "Gateway Timeout")).toBeNull();
    }
    expect(classifyIpfsFailure(504)).toBeNull();
  });

  it("remembers misses across reloads until they expire", async () => {
    const first = await load();
    first.recordIpfsMiss(CID, "/tansu.toml", "root", 504);
    first.recordIpfsMiss(OTHER_CID, "/summary.md", "path", 404);

    const reloaded = await load();
    // A dead CID hides every path; a missing file hides only itself.
    expect(reloaded.findIpfsMiss(CID, "/README.md")).toMatchObject({
      scope: "root",
      status: 504,
    });
    expect(reloaded.findIpfsMiss(OTHER_CID, "/summary.md")).toMatchObject({
      scope: "path",
      status: 404,
    });
    expect(reloaded.findIpfsMiss(OTHER_CID, "/proposal.md")).toBeUndefined();

    vi.setSystemTime(Date.now() + DAY - 1);
    expect(reloaded.findIpfsMiss(CID, "/README.md")).toBeDefined();
    vi.setSystemTime(Date.now() + 2);
    expect(reloaded.findIpfsMiss(CID, "/README.md")).toBeUndefined();
    expect(reloaded.findIpfsMiss(OTHER_CID, "/summary.md")).toBeUndefined();
  });

  it("shares entries between tabs, caps them and clears one CID", async () => {
    const tabA = await load();
    const tabB = await load();
    tabA.recordIpfsMiss(CID, "/tansu.toml", "path", 404);
    tabB.recordIpfsMiss(OTHER_CID, "/tansu.toml", "root", 504);
    expect(tabA.findIpfsMiss(OTHER_CID, "/tansu.toml")).toBeDefined();
    expect(tabB.findIpfsMiss(CID, "/tansu.toml")).toBeDefined();

    // Above 200 entries, the ones expiring first go.
    for (let i = 0; i < 200; i++) {
      vi.setSystemTime(Date.now() + 1);
      tabA.recordIpfsMiss(CID, `/image-${i}.png`, "path", 404);
    }
    const stored = JSON.parse(storage.getItem(KEY)!);
    expect(Object.keys(stored)).toHaveLength(200);
    expect(tabA.findIpfsMiss(CID, "/tansu.toml")).toBeUndefined();
    expect(tabA.findIpfsMiss(OTHER_CID, "/tansu.toml")).toBeUndefined();
    expect(tabA.findIpfsMiss(CID, "/image-199.png")).toBeDefined();

    tabB.recordIpfsMiss(OTHER_CID, "/README.md", "root", 504);
    tabB.clearIpfsMisses(CID);
    expect(tabA.findIpfsMiss(CID, "/image-199.png")).toBeUndefined();
    expect(tabA.findIpfsMiss(OTHER_CID, "/README.md")).toBeDefined();
  });

  it("keeps working when storage is corrupt or unavailable", async () => {
    storage.setItem(KEY, "{not json");
    const corrupt = await load();
    expect(corrupt.findIpfsMiss(CID, "/tansu.toml")).toBeUndefined();
    corrupt.recordIpfsMiss(CID, "/tansu.toml", "root", 504);
    expect(corrupt.findIpfsMiss(CID, "/tansu.toml")).toBeDefined();

    // Entries of the wrong shape are dropped one by one.
    storage.setItem(
      KEY,
      JSON.stringify({
        [CID]: { expiresAt: "soon", scope: "root", status: 504 },
        [OTHER_CID]: {
          expiresAt: Date.now() + DAY,
          scope: "root",
          status: 504,
        },
      }),
    );
    expect(corrupt.findIpfsMiss(CID, "/tansu.toml")).toBeUndefined();
    expect(corrupt.findIpfsMiss(OTHER_CID, "/tansu.toml")).toBeDefined();

    vi.stubGlobal("localStorage", undefined);
    const missing = await load();
    missing.recordIpfsMiss(CID, "/tansu.toml", "path", 404);
    expect(missing.findIpfsMiss(CID, "/tansu.toml")).toBeDefined();

    const full = memoryStorage();
    full.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    vi.stubGlobal("localStorage", full);
    const quota = await load();
    quota.recordIpfsMiss(CID, "/tansu.toml", "path", 404);
    expect(quota.findIpfsMiss(CID, "/tansu.toml")).toBeDefined();
    quota.clearIpfsMisses(CID);
    expect(quota.findIpfsMiss(CID, "/tansu.toml")).toBeUndefined();
  });
});
