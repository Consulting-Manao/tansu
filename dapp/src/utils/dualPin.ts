/**
 * IPFS upload client for the dApp.
 *
 * The browser never uses FILEBASE_TOKEN or PINATA_JWT directly.
 * Those credentials stay on the delegation worker, and this module
 * sends the raw files plus the already-signed transaction to that worker.
 */

const DUAL_PIN_TIMEOUT_MS = 120_000;
const WORKER_RETRY_DELAY_MS = 1_000;

interface DualUploadApiResponse {
  cid?: string;
  success?: boolean;
  error?: string;
}

export interface DualUploadResult {
  cid: string;
  success: boolean;
  error?: string;
}

interface UploadWithDelegationParams {
  cid: string;
  files: File[];
  signedTxXdr: string;
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function toBase64(buffer: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(buffer)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

interface UploadFilePayload {
  name: string;
  type: string;
  content: string;
}

async function serializeFiles(files: File[]): Promise<UploadFilePayload[]> {
  return await Promise.all(
    files.map(async (file) => ({
      name: file.name,
      type: file.type,
      content: toBase64(await file.arrayBuffer()),
    })),
  );
}

async function postUploadRequest(
  cid: string,
  signedTxXdr: string,
  files: UploadFilePayload[],
): Promise<DualUploadResult> {
  const response = await fetch(import.meta.env.PUBLIC_DELEGATION_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cid,
      signedTxXdr,
      files,
    }),
    signal: AbortSignal.timeout(DUAL_PIN_TIMEOUT_MS),
  });

  if (!response.ok) {
    let errorMessage = "IPFS upload failed";
    try {
      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const data = (await response.json()) as DualUploadApiResponse;
        errorMessage = data.error ?? errorMessage;
      } else {
        errorMessage = (await response.text()) || errorMessage;
      }
    } catch {
      // keep the default message
    }
    throw new Error(`${errorMessage} (${response.status})`);
  }

  const result = (await response.json()) as DualUploadApiResponse;
  if (!result.cid) {
    throw new Error("Dual upload response missing CID");
  }
  if (result.cid !== cid) {
    throw new Error(
      `Critical CID mismatch: expected ${cid}, got ${result.cid}`,
    );
  }
  if (!result.success) {
    throw new Error(result.error ?? "IPFS upload failed");
  }

  if (result.error) {
    console.warn("[IPFS] Upload partially succeeded:", result.error);
  }

  return {
    cid: result.cid,
    success: true,
    error: result.error,
  };
}

async function uploadWithDelegationResult({
  cid,
  files,
  signedTxXdr,
}: UploadWithDelegationParams): Promise<DualUploadResult> {
  if (!cid) {
    throw new Error("Missing expected CID for dual upload");
  }

  if (!signedTxXdr) {
    throw new Error("Missing signed transaction for dual upload");
  }

  if (!files.length) {
    throw new Error("Missing files for IPFS upload");
  }

  const serializedFiles = await serializeFiles(files);

  try {
    return await postUploadRequest(cid, signedTxXdr, serializedFiles);
  } catch (firstError) {
    await wait(WORKER_RETRY_DELAY_MS);

    try {
      return await postUploadRequest(cid, signedTxXdr, serializedFiles);
    } catch {
      throw firstError;
    }
  }
}

/**
 * Compatibility wrapper for the existing upload flow.
 * Existing callers expect only the CID after a successful dual pin.
 */
export async function uploadWithDelegation(
  params: UploadWithDelegationParams,
): Promise<string> {
  const result = await uploadWithDelegationResult(params);
  return result.cid;
}
