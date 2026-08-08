import { describe, expect, it, vi } from "vitest";
import { queryKeys } from "../../../src/service/cache/cacheKeys";
import {
  fetchWithCache,
  getCachedQueryAtom,
  getQuerySnapshot,
  invalidateQuery,
} from "../../../src/service/cache/cacheStore";

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

  it("invalidates entries whose keys contain bigint parts", async () => {
    const rawKey = queryKeys.proposal.raw("project-a", 123n as any);
    const detailKey = queryKeys.proposal.detail("project-a", 123n as any);
    const otherRawKey = queryKeys.proposal.raw("project-b", 123n as any);
    const otherNumberKey = queryKeys.proposal.raw("project-a", 124);

    await fetchWithCache(rawKey, vi.fn().mockResolvedValue({}), {
      ttlMs: 1000,
    });
    await fetchWithCache(detailKey, vi.fn().mockResolvedValue({}), {
      ttlMs: 1000,
    });
    await fetchWithCache(otherRawKey, vi.fn().mockResolvedValue({}), {
      ttlMs: 1000,
    });
    await fetchWithCache(otherNumberKey, vi.fn().mockResolvedValue({}), {
      ttlMs: 1000,
    });

    invalidateQuery(["proposal", "project-a", 123n as any]);

    expect(getQuerySnapshot(rawKey).isStale).toBe(true);
    expect(getQuerySnapshot(detailKey).isStale).toBe(true);
    expect(getQuerySnapshot(otherRawKey).isStale).toBe(false);
    expect(getQuerySnapshot(otherNumberKey).isStale).toBe(false);
  });

  it("invalidates entries whose keys contain undefined parts", async () => {
    const key = ["proposal", "project-a", undefined] as any;
    await fetchWithCache(key, vi.fn().mockResolvedValue({}), {
      ttlMs: 1000,
    });

    invalidateQuery(["proposal", "project-a"] as any);

    expect(getQuerySnapshot(key).isStale).toBe(true);
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
