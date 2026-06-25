import { atom } from "nanostores";
import type { WritableAtom } from "nanostores";
import type {
  CachedQueryStore,
  FetchWithCacheOptions,
  QueryKey,
  QuerySnapshot,
} from "./cacheTypes";

const registry = new Map<string, CachedQueryStore<unknown>>();

export function serializeQueryKey(queryKey: QueryKey): string {
  return JSON.stringify(
    queryKey.map((part) =>
      typeof part === "bigint" ? `${part.toString()}n` : part,
    ),
  );
}

function isPrefixMatch(key: QueryKey, prefix: QueryKey): boolean {
  if (prefix.length > key.length) return false;
  return prefix.every((part, index) => Object.is(part, key[index]));
}

function createSnapshot<T>(key: string): QuerySnapshot<T> {
  return {
    key,
    data: undefined,
    error: null,
    status: "idle",
    isLoading: false,
    isFetching: false,
    isStale: false,
    updatedAt: null,
    expiresAt: null,
    requestId: 0,
  };
}

function getStore<T>(queryKey: QueryKey): CachedQueryStore<T> {
  const key = serializeQueryKey(queryKey);
  const existing = registry.get(key);
  if (existing) return existing as CachedQueryStore<T>;

  const store = atom<QuerySnapshot<T>>(createSnapshot<T>(key)) as WritableAtom<
    QuerySnapshot<T>
  >;
  const entry: CachedQueryStore<T> = {
    atom: store,
    snapshot: store.get(),
    promise: null,
    requestId: 0,
  };

  store.listen((snapshot) => {
    entry.snapshot = snapshot;
  });

  registry.set(key, entry as CachedQueryStore<unknown>);
  return entry;
}

function updateStore<T>(
  entry: CachedQueryStore<T>,
  patch: Partial<QuerySnapshot<T>>,
): QuerySnapshot<T> {
  const next = { ...entry.snapshot, ...patch };
  entry.atom.set(next);
  entry.snapshot = next;
  return next;
}

export function getQuerySnapshot<T>(queryKey: QueryKey): QuerySnapshot<T> {
  return getStore<T>(queryKey).snapshot;
}

export function invalidateQuery(queryKey: QueryKey): void {
  const prefix = queryKey;
  for (const [serializedKey, entry] of registry.entries()) {
    const parsed = JSON.parse(serializedKey) as QueryKey;
    if (!isPrefixMatch(parsed, prefix)) continue;
    entry.requestId += 1;
    entry.promise = null;
    updateStore(entry as CachedQueryStore<any>, {
      isStale: true,
      isFetching: false,
      isLoading: false,
      error: null,
      expiresAt: 0,
      requestId: entry.requestId,
    });
  }
}

export async function fetchWithCache<T>(
  queryKey: QueryKey,
  fetcher: () => Promise<T>,
  options: FetchWithCacheOptions = {},
): Promise<T> {
  const entry = getStore<T>(queryKey);
  const now = Date.now();
  const ttlMs = options.ttlMs ?? 0;
  const hasFreshData =
    entry.snapshot.data !== undefined &&
    entry.snapshot.expiresAt !== null &&
    entry.snapshot.expiresAt > now &&
    !options.force;

  if (hasFreshData) {
    return entry.snapshot.data as T;
  }

  if (entry.promise && !options.force) {
    return entry.promise as Promise<T>;
  }

  const requestId = entry.requestId + 1;
  entry.requestId = requestId;

  const preserveData = entry.snapshot.data !== undefined;
  updateStore(entry, {
    requestId,
    isFetching: true,
    isLoading: !preserveData,
    isStale: preserveData,
    status: preserveData ? "success" : "loading",
    error: null,
  });

  const promise = (async () => {
    try {
      const data = await fetcher();
      if (entry.requestId !== requestId) return data;
      updateStore(entry, {
        data,
        status: "success",
        error: null,
        isLoading: false,
        isFetching: false,
        isStale: false,
        updatedAt: Date.now(),
        expiresAt: ttlMs > 0 ? Date.now() + ttlMs : null,
      });
      return data;
    } catch (error) {
      if (entry.requestId !== requestId) throw error;

      const err = error instanceof Error ? error : new Error(String(error));
      // Set a 30-second cooldown before retrying on error to avoid
      // infinite retry loops when the RPC endpoint is slow or unresponsive.
      const cooldownMs = 30_000;
      updateStore(entry, {
        error: err,
        isLoading: false,
        isFetching: false,
        status: entry.snapshot.data !== undefined ? "success" : "error",
        isStale: false,
        expiresAt: Date.now() + cooldownMs,
      });
      throw err;
    } finally {
      if (entry.requestId === requestId) {
        entry.promise = null;
      }
    }
  })();

  entry.promise = promise;
  return promise;
}

export async function prefetchQuery<T>(
  queryKey: QueryKey,
  fetcher: () => Promise<T>,
  options: FetchWithCacheOptions = {},
): Promise<T> {
  return fetchWithCache(queryKey, fetcher, { ...options, force: true });
}

export function readCachedQuery<T>(queryKey: QueryKey): T | undefined {
  return getStore<T>(queryKey).snapshot.data;
}

export function getCachedQueryAtom<T>(queryKey: QueryKey) {
  return getStore<T>(queryKey).atom;
}
