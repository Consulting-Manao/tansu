/**
 * IPFS gateway and fetch helpers. One read path: `ipfsQuery` (CID + path) →
 * remembered misses → gateways.
 */

import { queryOptions } from "@tanstack/react-query";
import toml from "toml";

import { isValidCid } from "./contentHashes";
import {
  classifyIpfsFailure,
  clearIpfsMisses,
  findIpfsMiss,
  IpfsMissError,
  recordIpfsMiss,
  type IpfsMissScope,
} from "./ipfsMissCache";

const GATEWAYS: ReadonlyArray<{
  name: string;
  buildUrl: (cid: string, path: string) => string;
}> = [
  {
    name: "filebase",
    buildUrl: (cid, path) => `https://ipfs.filebase.io/ipfs/${cid}${path}`,
  },
];

// A file just uploaded can take the gateway several seconds to serve.
const DEFAULT_IPFS_TIMEOUT_MS = 10000;
const PER_ATTEMPT_MS = 10000;

type FetchFromIpfsOptions = {
  timeoutMs?: number;
};

function normalizePath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

/**
 * One gateway request, body included, within `timeoutMs`: a gateway can
 * answer with headers and then stall.
 */
async function fetchOne(url: string, timeoutMs: number): Promise<Response> {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  return new Response(await response.arrayBuffer(), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

/**
 * Core IPFS fetch: CID + path, tried on each gateway in order. Read through
 * `ipfsQuery`, which keeps the answers; this only remembers final misses.
 */
export async function fetchFromIpfs(
  cid: string,
  path: string,
  options: FetchFromIpfsOptions = {},
): Promise<Response> {
  if (!isValidCid(cid)) {
    throw new Error("Invalid IPFS CID");
  }
  const pathNorm = normalizePath(path);
  const timeoutMs = options.timeoutMs ?? DEFAULT_IPFS_TIMEOUT_MS;

  const miss = findIpfsMiss(cid, pathNorm);
  if (miss) throw new IpfsMissError(cid, pathNorm, miss, true);

  const attemptMs = Math.min(timeoutMs, PER_ATTEMPT_MS);
  let lastError: unknown;
  // Final answers per gateway: a miss is only remembered when all agree.
  const misses: { scope: IpfsMissScope; status: number }[] = [];

  for (let i = 0; i < GATEWAYS.length; i++) {
    const gateway = GATEWAYS[i]!;
    try {
      const res = await fetchOne(gateway.buildUrl(cid, pathNorm), attemptMs);
      if (!res.ok) {
        lastError = new Error(`HTTP ${res.status} from ${gateway.name}`);
        // Only a 504 body tells a dead CID from a slow one.
        const body = res.status === 504 ? await res.text() : "";
        const scope = classifyIpfsFailure(res.status, body);
        if (scope) misses.push({ scope, status: res.status });
        continue;
      }
      return res;
    } catch (err) {
      lastError = err;
    }
  }

  if (misses.length === GATEWAYS.length) {
    const final = misses.find((m) => m.scope === "root") ?? misses[0]!;
    recordIpfsMiss(cid, pathNorm, final.scope, final.status);
    throw new IpfsMissError(cid, pathNorm, final, false);
  }
  throw lastError ?? new Error("IPFS fetch failed from all gateways");
}

/**
 * A file under a CID, as text. Content under a CID never changes, so it is
 * never refetched, and `null` (the gateway says the file is not there) is
 * final too. A dead CID or a temporary failure throws: the first is not
 * cached, since a re-upload revives the CID, and the miss cache already spares
 * the requests; a gateway's final answer is not retried either.
 */
export const ipfsQuery = (cid: string, path: string) =>
  queryOptions({
    queryKey: ["ipfs", cid, normalizePath(path)],
    queryFn: async () => {
      try {
        return await (await fetchFromIpfs(cid, path)).text();
      } catch (error) {
        if (error instanceof IpfsMissError && error.scope === "path") {
          return null;
        }
        throw error;
      }
    },
    staleTime: Infinity,
    retry: (failures, error) =>
      !(error instanceof IpfsMissError) && failures < 2,
  });

/** A tansu.toml's data; `undefined` when missing or not a Tansu file. */
export function parseTansuToml(text: string | null): any | undefined {
  if (!text?.trim()) return undefined;
  try {
    const data = toml.parse(text);
    return data?.DOCUMENTATION || data?.ACCOUNTS ? data : undefined;
  } catch {
    return undefined;
  }
}

// --- URL helpers (display only; do not use for fetch) ---

export const getIpfsBasicLink = (cid: string): string => {
  if (!isValidCid(cid)) return "";
  return GATEWAYS[0]!.buildUrl(cid, "");
};

/** Build gateway URL for CID and optional path (e.g. for links). */
export function getIpfsUrl(cid: string, path: string = ""): string {
  if (!isValidCid(cid)) return "";
  const pathNorm = path ? normalizePath(path) : "";
  return GATEWAYS[0]!.buildUrl(cid, pathNorm);
}

export const getProposalLinkFromIpfs = (cid: string): string =>
  getIpfsUrl(cid, "/proposal.md");

export const getOutcomeLinkFromIpfs = (cid: string): string =>
  getIpfsUrl(cid, "/outcomes.json");

export interface CarPackResult {
  cid: string;
  carBlob: Blob;
}

/**
 * Pack files into a CAR so the same payload can be reused for upload.
 */
export async function packFilesToCar(files: File[]): Promise<CarPackResult> {
  const { createDirectoryEncoderStream, CAREncoderStream } =
    await import("ipfs-car");

  const stream = createDirectoryEncoderStream(files);
  let rootCID: string | undefined;
  const blocks: any[] = [];

  await stream.pipeTo(
    new WritableStream({
      write(block) {
        blocks.push(block);
        rootCID = block.cid.toString();
      },
    }),
  );

  if (!rootCID) throw new Error("Failed to generate CID");

  const carEncoder = new CAREncoderStream([blocks[blocks.length - 1]!.cid]);
  const chunks: BlobPart[] = [];

  await new ReadableStream({
    pull(controller) {
      if (blocks.length > 0) {
        controller.enqueue(blocks.shift());
      } else {
        controller.close();
      }
    },
  })
    .pipeThrough(carEncoder)
    .pipeTo(
      new WritableStream({
        write(chunk) {
          chunks.push(new Uint8Array(chunk));
        },
      }),
    );

  return {
    cid: rootCID,
    carBlob: new Blob(chunks, { type: "application/vnd.ipld.car" }),
  };
}

interface UploadToIpfsProxyResponse {
  cid?: string;
  success?: boolean;
  error?: string;
}

/**
 * Upload a CAR through the delegation worker. The worker takes one proof: the
 * signed envelope about to be sent, or the hash of the transaction a wallet
 * already submitted with this CID.
 */
export async function uploadToIpfsProxy(
  params: { cid: string; carBlob: Blob } & (
    | { signedTxXdr: string; txHash?: undefined }
    | { txHash: string; signedTxXdr?: undefined }
  ),
): Promise<string> {
  const { cid, carBlob, signedTxXdr, txHash } = params;

  if (!cid) {
    throw new Error("Missing expected CID for IPFS upload");
  }

  if (!signedTxXdr && !txHash) {
    throw new Error("Missing signed transaction for IPFS upload");
  }

  if (!(carBlob instanceof Blob) || carBlob.size === 0) {
    throw new Error("Invalid CAR blob for IPFS upload");
  }

  const bytes = new Uint8Array(await carBlob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  const car = btoa(binary);

  async function uploadOnce(): Promise<string> {
    const response = await fetch(import.meta.env.PUBLIC_DELEGATION_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        signedTxXdr ? { cid, signedTxXdr, car } : { cid, txHash, car },
      ),
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
      let errorMessage = "IPFS upload failed";
      try {
        const contentType = response.headers.get("content-type") ?? "";
        if (contentType.includes("application/json")) {
          const data = (await response.json()) as UploadToIpfsProxyResponse;
          errorMessage = data.error ?? errorMessage;
        } else {
          errorMessage = (await response.text()) || errorMessage;
        }
      } catch {
        // Keep the default message if parsing fails.
      }
      throw new Error(`${errorMessage} (${response.status})`);
    }

    const result = (await response.json()) as UploadToIpfsProxyResponse;
    if (!result.cid) {
      throw new Error("Upload response missing CID");
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
    // Reads right after this write must not hit a miss remembered earlier.
    clearIpfsMisses(cid);
    return result.cid;
  }

  try {
    return await uploadOnce();
  } catch (firstError) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    try {
      return await uploadOnce();
    } catch {
      throw firstError;
    }
  }
}
