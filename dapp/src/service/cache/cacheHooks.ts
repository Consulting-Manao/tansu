import { useStore } from "@nanostores/react";
import { useEffect, useRef } from "react";
import {
  fetchWithCache,
  getCachedQueryAtom,
  invalidateQuery,
  prefetchQuery,
  serializeQueryKey,
} from "./cacheStore";
import type { FetchWithCacheOptions, QueryKey } from "./cacheTypes";

type UseCachedQueryOptions<T> = {
  queryKey: QueryKey;
  queryFn: () => Promise<T>;
  enabled?: boolean;
  ttlMs?: number;
};

function shouldFetch(snapshot: {
  data: unknown;
  isFetching: boolean;
  isStale: boolean;
  expiresAt: number | null;
  status: string;
}): boolean {
  if (snapshot.isFetching) return false;
  // If a cooldown or TTL is still active, don't fetch (covers both
  // fresh data and error cooldown windows).
  if (snapshot.expiresAt !== null && snapshot.expiresAt > Date.now()) {
    return false;
  }
  if (snapshot.status === "idle") return true;
  if (snapshot.status === "error" && snapshot.data === undefined) return true;
  if (snapshot.data === undefined) return true;
  if (snapshot.isStale) return true;
  if (snapshot.expiresAt !== null && snapshot.expiresAt <= Date.now()) {
    return true;
  }
  return false;
}

export function useCachedQuery<T>({
  queryKey,
  queryFn,
  enabled = true,
  ttlMs,
}: UseCachedQueryOptions<T>) {
  const queryKeyString = serializeQueryKey(queryKey);
  const snapshot = useStore(getCachedQueryAtom<T>(queryKey));
  const queryFnRef = useRef(queryFn);

  queryFnRef.current = queryFn;

  useEffect(() => {
    if (!enabled) return;
    if (!shouldFetch(snapshot)) return;

    const cacheOptions =
      ttlMs === undefined
        ? {
            force:
              snapshot.status === "error" ||
              snapshot.data === undefined ||
              snapshot.isStale ||
              (snapshot.expiresAt !== null && snapshot.expiresAt <= Date.now()),
          }
        : {
            ttlMs,
            force:
              snapshot.status === "error" ||
              snapshot.data === undefined ||
              snapshot.isStale ||
              (snapshot.expiresAt !== null && snapshot.expiresAt <= Date.now()),
          };

    void fetchWithCache(queryKey, () => queryFnRef.current(), cacheOptions);
  }, [
    enabled,
    queryKeyString,
    snapshot.data,
    snapshot.expiresAt,
    snapshot.isFetching,
    snapshot.isStale,
    snapshot.status,
    ttlMs,
  ]);

  // Auto-refresh: schedule a refetch for the instant the cached value expires
  // and refresh stale/expired data when the tab regains focus. Both paths go
  // through shouldFetch, so an in-flight request or an active error cooldown
  // is never disturbed (no hammering of a slow/unresponsive RPC endpoint).
  useEffect(() => {
    if (!enabled) return;

    const atom = getCachedQueryAtom<T>(queryKey);
    let timer: ReturnType<typeof setTimeout> | undefined;

    const refreshIfNeeded = () => {
      const current = atom.get();
      if (!shouldFetch(current)) return;
      void fetchWithCache(
        queryKey,
        () => queryFnRef.current(),
        ttlMs === undefined ? { force: true } : { ttlMs, force: true },
      );
    };

    const current = atom.get();
    // Only schedule while the data is healthy, the tab is visible, and the
    // value is still fresh. In particular, do NOT re-arm after a failed
    // fetch: the error cooldown would otherwise retry every 30s forever
    // against a down endpoint. Focus/visibility and re-renders still retry.
    if (
      current.expiresAt !== null &&
      current.expiresAt > Date.now() &&
      current.error === null &&
      document.visibilityState === "visible"
    ) {
      timer = setTimeout(refreshIfNeeded, current.expiresAt - Date.now());
    }

    const handleVisibility = () => {
      if (document.visibilityState === "visible") refreshIfNeeded();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", refreshIfNeeded);

    return () => {
      if (timer !== undefined) clearTimeout(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", refreshIfNeeded);
    };
  }, [
    enabled,
    queryKeyString,
    snapshot.expiresAt,
    snapshot.isFetching,
    snapshot.isStale,
    snapshot.status,
    ttlMs,
  ]);

  return {
    ...snapshot,
    refetch: (options: FetchWithCacheOptions = {}) =>
      fetchWithCache(
        queryKey,
        () => queryFnRef.current(),
        ttlMs === undefined
          ? {
              force: options.force ?? true,
            }
          : {
              ttlMs,
              force: options.force ?? true,
            },
      ),
    prefetch: () =>
      prefetchQuery(
        queryKey,
        () => queryFnRef.current(),
        ttlMs === undefined ? {} : { ttlMs },
      ),
    invalidate: () => invalidateQuery(queryKey),
  };
}
