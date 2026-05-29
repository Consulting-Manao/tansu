import { describe, expect, it, vi } from "vitest";
import { queryKeys } from "./cacheKeys";
import {
  fetchWithCache,
  getCachedQueryAtom,
  getQuerySnapshot,
  invalidateQuery,
} from "./cacheStore";

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("cacheStore", () => {
  it("deduplicates simultaneous requests for the same key", async () => {
    const key = queryKeys.projects.page(1);
    const deferred = createDeferred<string[]>();
    const fetcher = vi.fn(() => deferred.promise);

    const first = fetchWithCache(key, fetcher, { ttlMs: 1000 });
    const second = fetchWithCache(key, fetcher, { ttlMs: 1000 });

    expect(fetcher).toHaveBeenCalledTimes(1);

    deferred.resolve(["alpha", "beta"]);
    await expect(first).resolves.toEqual(["alpha", "beta"]);
    await expect(second).resolves.toEqual(["alpha", "beta"]);

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("reuses a fresh cached value until invalidated", async () => {
    const key = queryKeys.project.byId("cached-project");
    const fetcher = vi.fn().mockResolvedValue({ name: "cached" });

    await expect(
      fetchWithCache(key, fetcher, { ttlMs: 1000 }),
    ).resolves.toEqual({ name: "cached" });
    await expect(
      fetchWithCache(key, fetcher, { ttlMs: 1000 }),
    ).resolves.toEqual({ name: "cached" });

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("marks matching entries stale when invalidated", async () => {
    const key = queryKeys.proposals.list("project-a", 0);
    const fetcher = vi.fn().mockResolvedValue([{ id: 1 }]);

    await fetchWithCache(key, fetcher, { ttlMs: 1000 });
    invalidateQuery(queryKeys.proposals.all("project-a"));

    const snapshot = getQuerySnapshot(key);
    expect(snapshot.isStale).toBe(true);
    expect(snapshot.expiresAt).toBe(0);
    expect(snapshot.status).toBe("success");
  });

  it("drops in-flight responses after invalidation", async () => {
    const key = queryKeys.projects.page(9);
    const deferred = createDeferred<string[]>();
    const fetcher = vi.fn(() => deferred.promise);

    const request = fetchWithCache(key, fetcher, { ttlMs: 1000 });
    invalidateQuery(queryKeys.projects.all);
    deferred.resolve(["late"]);

    await expect(request).resolves.toEqual(["late"]);
    const snapshot = getQuerySnapshot(key);
    expect(snapshot.data).toBeUndefined();
    expect(snapshot.isStale).toBe(true);
  });

  it("exposes the same atom for repeated lookups", () => {
    const key = queryKeys.membership.detail("GTEST");
    const first = getCachedQueryAtom(key);
    const second = getCachedQueryAtom(key);

    expect(first).toBe(second);
  });
});
