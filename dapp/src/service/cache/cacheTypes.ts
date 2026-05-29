import type { WritableAtom } from "nanostores";

export type QueryKeyPart =
  | string
  | number
  | boolean
  | null
  | undefined
  | bigint;

export type QueryKey = readonly QueryKeyPart[];

export type QueryStatus = "idle" | "loading" | "success" | "error";

export interface QuerySnapshot<T> {
  key: string;
  data: T | undefined;
  error: Error | null;
  status: QueryStatus;
  isLoading: boolean;
  isFetching: boolean;
  isStale: boolean;
  updatedAt: number | null;
  expiresAt: number | null;
  requestId: number;
}

export interface FetchWithCacheOptions {
  ttlMs?: number;
  force?: boolean;
}

export interface CachedQueryStore<T> {
  atom: WritableAtom<QuerySnapshot<T>>;
  snapshot: QuerySnapshot<T>;
  promise: Promise<T | undefined> | null;
  requestId: number;
}
