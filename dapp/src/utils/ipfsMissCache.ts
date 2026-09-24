/**
 * Remembers IPFS URLs the gateway answered for good, so dead content is not
 * requested again on every visit.
 *
 * A CID no node provides any more is remembered as a whole (`root`); a file
 * missing under a live CID only for its own path (`path`). Entries expire a
 * fixed 24 h after they are recorded. They live in localStorage, read and
 * written on every call so reloads and other tabs share them, with an
 * in-memory fallback when storage is unavailable.
 *
 * Known limit: Nido submits the transaction before the upload. A browser that
 * requests the new CID in that gap can get "no providers" and hide the content
 * for up to 24 h: `clearIpfsMisses` only runs in the uploader's browser.
 */

export type IpfsMissScope = "root" | "path";

interface IpfsMiss {
  expiresAt: number;
  scope: IpfsMissScope;
  status: number;
}

const STORAGE_KEY = "tansu_ipfs_misses_v1";
const MISS_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 200;

const memory = new Map<string, IpfsMiss>();
let storageFailed = false;

function storage(): Storage | null {
  if (storageFailed) return null;
  try {
    const store = globalThis.localStorage;
    store.getItem(STORAGE_KEY);
    return store;
  } catch {
    return null;
  }
}

function isMiss(value: unknown): value is IpfsMiss {
  if (!value || typeof value !== "object") return false;
  const { expiresAt, scope, status } = value as Record<string, unknown>;
  return (
    typeof expiresAt === "number" &&
    (scope === "root" || scope === "path") &&
    typeof status === "number"
  );
}

function load(store: Storage | null): Map<string, IpfsMiss> {
  if (!store) return memory;
  const entries = new Map<string, IpfsMiss>();
  try {
    const parsed: unknown = JSON.parse(store.getItem(STORAGE_KEY) ?? "{}");
    if (parsed && typeof parsed === "object") {
      for (const [key, value] of Object.entries(parsed)) {
        if (isMiss(value)) entries.set(key, value);
      }
    }
  } catch {
    // A corrupt value counts as empty.
  }
  return entries;
}

function update(change: (entries: Map<string, IpfsMiss>) => void): void {
  const store = storage();
  const entries = load(store);
  change(entries);

  const now = Date.now();
  for (const [key, miss] of entries) {
    if (miss.expiresAt <= now) entries.delete(key);
  }
  const excess = entries.size - MAX_ENTRIES;
  if (excess > 0) {
    const firstToExpire = [...entries].sort(
      ([, a], [, b]) => a.expiresAt - b.expiresAt,
    );
    for (const [key] of firstToExpire.slice(0, excess)) entries.delete(key);
  }

  if (!store) return;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    storageFailed = true;
    for (const [key, miss] of entries) memory.set(key, miss);
  }
}

/**
 * Whether a failed gateway answer is final: `root` when no node provides the
 * CID, `path` when only this file is missing, `null` when it may be temporary.
 */
export function classifyIpfsFailure(
  status: number,
  body = "",
): IpfsMissScope | null {
  if (status === 504 && /no providers/i.test(body)) return "root";
  if ([400, 404, 410, 451].includes(status)) return "path";
  return null;
}

/** The remembered miss covering this CID and path (leading slash), if any. */
export function findIpfsMiss(
  cid: string,
  path: string,
): Omit<IpfsMiss, "expiresAt"> | undefined {
  const now = Date.now();
  const entries = load(storage());
  for (const key of [cid, cid + path]) {
    const miss = entries.get(key);
    if (miss && miss.expiresAt > now) return miss;
  }
  return undefined;
}

export function recordIpfsMiss(
  cid: string,
  path: string,
  scope: IpfsMissScope,
  status: number,
): void {
  update((entries) => {
    entries.set(scope === "root" ? cid : cid + path, {
      expiresAt: Date.now() + MISS_TTL_MS,
      scope,
      status,
    });
  });
}

/** Forget every miss of a CID, e.g. once it has just been uploaded. */
export function clearIpfsMisses(cid: string): void {
  update((entries) => {
    for (const key of [...entries.keys()]) {
      if (key === cid || key.startsWith(`${cid}/`)) entries.delete(key);
    }
  });
}

/** Forget every miss, e.g. when the query cache is reset for a new build. */
export function clearAllIpfsMisses(): void {
  update((entries) => entries.clear());
}

export class IpfsMissError extends Error {
  override name = "IpfsMissError";
  readonly cid: string;
  readonly path: string;
  readonly scope: IpfsMissScope;
  readonly status: number;
  readonly fromCache: boolean;

  constructor(
    cid: string,
    path: string,
    miss: Omit<IpfsMiss, "expiresAt">,
    fromCache: boolean,
  ) {
    super(
      `IPFS content unavailable: ${miss.scope === "root" ? cid : cid + path} (HTTP ${miss.status})`,
    );
    this.cid = cid;
    this.path = path;
    this.scope = miss.scope;
    this.status = miss.status;
    this.fromCache = fromCache;
  }
}
