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
