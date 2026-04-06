/**
 * Dual IPFS Pinning Utility
 *
 * Uploads data to both Storacha (primary) and Filebase (backup) to ensure
 * redundancy. If one provider fails, the other still serves as a backup.
 *
 * Usage: wrap any upload call with `dualPin` to automatically pin to Filebase
 * after the primary Storacha upload succeeds.
 */

const FILEBASE_API_URL = "https://api.filebase.io/v1/ipfs";

type PinResult = {
  cid: string;
  pinned: boolean;
  provider: string;
  error?: string;
};

/**
 * Pin a CID to Filebase as backup.
 *
 * Requires FILEBASE_API_KEY env var to be set.
 * If the key is missing, this is a no-op (graceful degradation).
 */
export async function pinToFilebase(cid: string): Promise<PinResult> {
  const apiKey = import.meta.env.FILEBASE_API_KEY;
  if (!apiKey) {
    console.warn("[DualPin] FILEBASE_API_KEY not set, skipping Filebase pin");
    return {
      cid,
      pinned: false,
      provider: "filebase",
      error: "API key not configured",
    };
  }

  try {
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

    if (res.ok) {
      console.info(`[DualPin] Filebase pin succeeded for CID: ${cid}`);
      return { cid, pinned: true, provider: "filebase" };
    }

    const text = await res.text();
    console.warn(`[DualPin] Filebase pin failed: ${res.status} ${text}`);
    return {
      cid,
      pinned: false,
      provider: "filebase",
      error: `HTTP ${res.status}`,
    };
  } catch (err: any) {
    console.warn(`[DualPin] Filebase pin error: ${err.message}`);
    return { cid, pinned: false, provider: "filebase", error: err.message };
  }
}

/**
 * Check if a CID is pinned on Filebase.
 */
export async function checkFilebasePinStatus(cid: string): Promise<boolean> {
  const apiKey = import.meta.env.FILEBASE_API_KEY;
  if (!apiKey) return false;

  try {
    const res = await fetch(`${FILEBASE_API_URL}/pins/${cid}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Dual-pin wrapper: executes a primary upload function, then pins the
 * resulting CID to Filebase in the background.
 *
 * @param primaryUpload - The primary upload function (e.g., Storacha)
 * @returns The CID from the primary upload (unchanged)
 */
export async function dualPin(
  primaryUpload: () => Promise<string>,
): Promise<string> {
  const cid = await primaryUpload();

  // Fire-and-forget Filebase pin (don't block the user flow)
  pinToFilebase(cid).catch((err) => {
    console.warn("[DualPin] Background Filebase pin failed:", err.message);
  });

  return cid;
}

/**
 * Dual-pin with verification: waits for both uploads to complete.
 * Use this when you need guaranteed dual-pinning before proceeding.
 */
export async function dualPinVerified(
  primaryUpload: () => Promise<string>,
): Promise<{ cid: string; filebasePinned: boolean }> {
  const cid = await primaryUpload();
  const filebaseResult = await pinToFilebase(cid);
  return { cid, filebasePinned: filebaseResult.pinned };
}
