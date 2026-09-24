/**
 * The one cache of the app: TanStack Query, kept in IndexedDB between visits.
 *
 * Every read of the chain, IPFS, a Git host or Horizon is a query built by a
 * `...Query()` factory next to its service; keys start with their domain
 * ("project", "proposal", "ipfs", ...) so a write refreshes what it changed by
 * prefix (`invalidateAfter`). Islands are separate React roots, so there is no
 * provider: components pass `queryClient` to `useQuery`.
 */
import { QueryClient, type QueryKey } from "@tanstack/react-query";
import {
  persistQueryClient,
  type PersistedClient,
  type Persister,
} from "@tanstack/query-persist-client-core";
import { Buffer } from "buffer";
import { del, get, set } from "idb-keyval";
import { clearAllIpfsMisses } from "../utils/ipfsMissCache";

const MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const STORE_KEY = "tansu-queries";

/** What is worth keeping across visits; the rest lives for the session. */
const PERSISTED = new Set([
  "projects",
  "project",
  "badges",
  "commit",
  "anonymousConfig",
  "proposals",
  "proposal",
  "conflicts",
  "member",
  "evidence",
  "attestations",
  "threshold",
  "ipfs",
  "repo",
  "activity",
]);

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: MAX_AGE,
      refetchOnWindowFocus: false,
    },
  },
});

/** Contract bytes are Buffers; IndexedDB gives them back as Uint8Arrays. */
function revive(value: unknown): unknown {
  if (value instanceof Uint8Array) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  if (Array.isArray(value)) return value.map(revive);
  if (value && typeof value === "object" && !(value instanceof Map)) {
    for (const [key, item] of Object.entries(value)) {
      (value as Record<string, unknown>)[key] = revive(item);
    }
  }
  return value;
}

let pending: ReturnType<typeof setTimeout> | undefined;
const persister: Persister = {
  // Stored as is: IndexedDB's structured clone keeps bigints.
  persistClient: (client) => {
    clearTimeout(pending);
    pending = setTimeout(() => void set(STORE_KEY, client), 1000);
  },
  restoreClient: async () =>
    revive(await get<PersistedClient>(STORE_KEY)) as PersistedClient,
  // A new build or contract, or an expired cache: remembered IPFS misses go too.
  removeClient: async () => {
    clearAllIpfsMisses();
    await del(STORE_KEY);
  },
};

// Only in a browser: scripts and unit tests run without IndexedDB.
if (typeof window !== "undefined" && "indexedDB" in window) {
  queryClient.mount();
  const [, restored] = persistQueryClient({
    queryClient,
    persister,
    maxAge: MAX_AGE,
    buster: `${import.meta.env.PUBLIC_TANSU_CONTRACT_ID}:${import.meta.env.PUBLIC_BUILD}`,
    dehydrateOptions: {
      shouldDehydrateQuery: (query) =>
        query.state.status === "success" &&
        PERSISTED.has(String(query.queryKey[0])),
    },
  });
  // Islands import this module: they render from the restored cache.
  await restored.catch(() => {});
}

/**
 * Run a write, then refetch everything under `keys`, even when the write
 * failed: it may have landed before the error.
 */
export async function invalidateAfter<T>(
  write: Promise<T>,
  ...keys: QueryKey[]
): Promise<T> {
  try {
    return await write;
  } finally {
    await Promise.all(
      keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    );
  }
}
