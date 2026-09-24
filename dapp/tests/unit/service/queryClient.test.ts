import { Buffer } from "buffer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// IndexedDB keeps what structured clone keeps: bigints, and bytes as
// Uint8Arrays.
const store = vi.hoisted(() => new Map<string, unknown>());
vi.mock("idb-keyval", () => ({
  get: async (key: string) => structuredClone(store.get(key)),
  set: async (key: string, value: unknown) =>
    void store.set(key, structuredClone(value)),
  del: async (key: string) => void store.delete(key),
}));

/** The module as a new page load gets it, restore included. */
async function load() {
  vi.resetModules();
  return await import("../../../src/service/queryClient");
}

describe("queryClient", () => {
  beforeEach(() => {
    store.clear();
    vi.useFakeTimers();
    vi.stubGlobal("window", {
      indexedDB: {},
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    const saved = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => void saved.set(key, value),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("keeps reads across visits, until the next build", async () => {
    const project = {
      name: "demo",
      sub_projects: [Buffer.from("ab", "hex")],
      created: 2n,
    };
    const first = await load();
    first.queryClient.setQueryData(["project", "ab"], project);
    first.queryClient.setQueryData(["votingPower", "ab", "GA"], 5);
    await vi.advanceTimersByTimeAsync(1000);

    const second = await load();
    const restored = second.queryClient.getQueryData<typeof project>([
      "project",
      "ab",
    ]);
    expect(restored).toEqual(project);
    expect(Buffer.isBuffer(restored?.sub_projects[0])).toBe(true);
    // Only for the session.
    expect(
      second.queryClient.getQueryData(["votingPower", "ab", "GA"]),
    ).toBeUndefined();

    // A new build forgets the remembered IPFS misses too.
    const misses = await import("../../../src/utils/ipfsMissCache");
    misses.recordIpfsMiss("bafydead", "/tansu.toml", "root", 504);
    vi.stubEnv("PUBLIC_BUILD", "next");
    const next = await load();
    expect(next.queryClient.getQueryData(["project", "ab"])).toBeUndefined();
    expect(store.size).toBe(0);
    expect(misses.findIpfsMiss("bafydead", "/tansu.toml")).toBeUndefined();
  });

  it("refetches after a write, even one that failed", async () => {
    const { queryClient, invalidateAfter } = await load();
    await queryClient.query({
      queryKey: ["member", "GA"],
      queryFn: async () => ({ meta: "" }),
      staleTime: Infinity,
    });

    await expect(
      invalidateAfter(Promise.reject(new Error("rejected")), ["member"]),
    ).rejects.toThrow("rejected");
    expect(queryClient.getQueryState(["member", "GA"])?.isInvalidated).toBe(
      true,
    );
  });
});
