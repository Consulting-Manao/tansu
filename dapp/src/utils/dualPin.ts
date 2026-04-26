/**
 * Multi-Provider IPFS Pinning Utility
 *
 * Ensures data availability by pinning CIDs to multiple providers:
 * 1. Storacha (Primary - usually handled by the caller)
 * 2. Filebase (Backup)
 * 3. Pinata (Backup)
 *
 * Includes automatic retries with exponential backoff for transient failures.
 */

const FILEBASE_API_URL = "https://api.filebase.io/v1/ipfs";
const PINATA_API_URL = "https://api.pinata.cloud/pinning/pinByHash";

/**
 * Accessor for environment variables, separated for testability.
 */
export const pinConfig = {
  getFilebaseKey: () => import.meta.env.FILEBASE_API_KEY,
  getPinataJwt: () => import.meta.env.PINATA_JWT,
};

type PinResult = {
  cid: string;
  pinned: boolean;
  provider: string;
  error?: string;
};

/**
 * Generic retry helper with exponential backoff.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 1000,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (retries <= 0) throw err;
    await new Promise((resolve) => setTimeout(resolve, delay));
    return withRetry(fn, retries - 1, delay * 2);
  }
}

/**
 * Pin a CID to Filebase as backup.
 */
export async function pinToFilebase(cid: string): Promise<PinResult> {
  const apiKey = pinConfig.getFilebaseKey();
  if (!apiKey) {
    return { cid, pinned: false, provider: "filebase", error: "API key not configured" };
  }

  const pinAction = async () => {
    const res = await fetch(`${FILEBASE_API_URL}/pins`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        cid,
        name: `tansu-backup-${cid.slice(0, 12)}`,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
    return true;
  };

  try {
    await withRetry(pinAction);
    console.info(`[MultiPin] Filebase pin succeeded for CID: ${cid}`);
    return { cid, pinned: true, provider: "filebase" };
  } catch (err: any) {
    console.warn(`[MultiPin] Filebase pin failed after retries: ${err.message}`);
    return { cid, pinned: false, provider: "filebase", error: err.message };
  }
}

/**
 * Pin a CID to Pinata as backup.
 */
export async function pinToPinata(cid: string): Promise<PinResult> {
  const jwt = pinConfig.getPinataJwt();
  if (!jwt) {
    return { cid, pinned: false, provider: "pinata", error: "JWT not configured" };
  }

  const pinAction = async () => {
    const res = await fetch(PINATA_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        hashToPin: cid,
        pinataMetadata: {
          name: `tansu-backup-${cid.slice(0, 12)}`,
        },
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
    return true;
  };

  try {
    await withRetry(pinAction);
    console.info(`[MultiPin] Pinata pin succeeded for CID: ${cid}`);
    return { cid, pinned: true, provider: "pinata" };
  } catch (err: any) {
    console.warn(`[MultiPin] Pinata pin failed after retries: ${err.message}`);
    return { cid, pinned: false, provider: "pinata", error: err.message };
  }
}

/**
 * Trigger concurrent pins to all backup providers.
 */
export async function pinToBackups(cid: string): Promise<PinResult[]> {
  return await Promise.all([
    pinToFilebase(cid),
    pinToPinata(cid),
  ]);
}

/**
 * Dual-pin wrapper: executes a primary upload function, then pins the
 * resulting CID to all backups in the background.
 */
export async function dualPin(
  primaryUpload: () => Promise<string>,
): Promise<string> {
  const cid = await primaryUpload();

  // Fire-and-forget backup pins
  pinToBackups(cid).catch((err) => {
    console.warn("[MultiPin] Background backup pins failed:", err.message);
  });

  return cid;
}

/**
 * Dual-pin with verification: waits for all uploads and backups to complete.
 */
export async function dualPinVerified(
  primaryUpload: () => Promise<string>,
): Promise<{ cid: string; backups: PinResult[] }> {
  const cid = await primaryUpload();
  const backups = await pinToBackups(cid);
  return { cid, backups };
}
