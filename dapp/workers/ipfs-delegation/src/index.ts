/**
 * Cloudflare Worker for delegated IPFS uploads.
 *
 * The dapp sends the raw files plus the already-signed transaction that will
 * later be submitted on-chain. The worker verifies the transaction signature,
 * uploads the files to Filebase, then optionally pins the resulting CID on
 * Pinata in the background.
 */

import { Keypair, Networks, Transaction } from "@stellar/stellar-sdk";

export interface Env {
  FILEBASE_TOKEN: string;
  PINATA_JWT?: string;
  PINATA_GROUP_ID?: string;
  ENABLE_PINATA_PINNING?: string;
}

interface UploadRequest {
  cid: string;
  signedTxXdr: string;
  files: UploadFile[];
}

interface UploadFile {
  name: string;
  type?: string;
  content: string;
}

const ALLOWED_ORIGINS = [
  "http://localhost:4321",
  "https://testnet.tansu.dev",
  "https://app.tansu.dev",
  "https://tansu.xlm.sh",
  "https://deploy-preview-*--staging-tansu.netlify.app",
];
const FILEBASE_MAX_ATTEMPTS = 3;
const PINATA_MAX_ATTEMPTS = 3;

function isPinataEnabled(env: Env): boolean {
  return env.ENABLE_PINATA_PINNING === "true";
}

function getCorsHeaders(origin: string | null): Record<string, string> {
  if (!origin) return {};

  const isAllowed = ALLOWED_ORIGINS.some(
    (allowed) =>
      allowed === origin ||
      (allowed.includes("*") &&
        new RegExp(`^${allowed.replace(/\*/g, ".*")}$`).test(origin)),
  );

  if (!isAllowed) return {};

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function decodeBase64(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

function buildUploadFiles(files: UploadFile[]): File[] {
  return files.map(
    (file) =>
      new File([decodeBase64(file.content)], file.name, {
        type: file.type || "application/octet-stream",
      }),
  );
}

function validateUploadRequest(body: UploadRequest): void {
  const { cid, signedTxXdr, files } = body;

  if (!cid || !signedTxXdr || !files?.length) {
    throw new Error("Missing required fields: cid, signedTxXdr and files");
  }
}

function validateSignedTransaction(signedTxXdr: string): void {
  const passphrases = [Networks.TESTNET, Networks.PUBLIC];
  let verifiedTransaction: Transaction | null = null;

  for (const passphrase of passphrases) {
    try {
      const tx = new Transaction(signedTxXdr, passphrase);
      if (!tx.signatures?.length || !tx.source) {
        continue;
      }

      const sourceKeypair = Keypair.fromPublicKey(tx.source);
      const txHash = tx.hash();

      for (const signature of tx.signatures) {
        if (sourceKeypair.verify(txHash, signature.signature())) {
          verifiedTransaction = tx;
          break;
        }
      }

      if (verifiedTransaction) {
        break;
      }
    } catch {
      continue;
    }
  }

  if (!verifiedTransaction) {
    throw new Error("Transaction signature is invalid for the source account");
  }

  if (!verifiedTransaction.operations?.length) {
    throw new Error("Transaction must have at least one operation");
  }
}

async function calculateCidFromFiles(files: File[]): Promise<string> {
  const { createDirectoryEncoderStream } = await import("ipfs-car");
  const stream = createDirectoryEncoderStream(files);
  let rootCid: string | undefined;

  await stream.pipeTo(
    new WritableStream({
      write(block) {
        rootCid = block.cid.toString();
      },
    }),
  );

  if (!rootCid) {
    throw new Error("Failed to calculate CID from uploaded files");
  }

  return rootCid;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function withExponentialBackoff<T>(
  operation: () => Promise<T>,
  maxAttempts: number,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts - 1) {
        await sleep(500 * 2 ** attempt);
      }
    }
  }

  throw lastError;
}

function extractFinalHash(addResponseText: string): string | undefined {
  const lines = addResponseText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const parsed = JSON.parse(lines[index]!) as { Hash?: string };
      if (parsed.Hash) {
        return parsed.Hash;
      }
    } catch {
      continue;
    }
  }

  return undefined;
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const origin = request.headers.get("Origin");
    const corsHeaders = getCorsHeaders(origin);

    // Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    if (request.method !== "POST") {
      return new Response(
        JSON.stringify({ success: false, error: "Method not allowed" }),
        {
          status: 405,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    let body: UploadRequest;
    try {
      body = (await request.json()) as UploadRequest;
      validateUploadRequest(body);
      validateSignedTransaction(body.signedTxXdr);
    } catch (error: any) {
      return new Response(
        JSON.stringify({
          success: false,
          error: error?.message ?? "Invalid upload request",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const uploadFiles = buildUploadFiles(body.files);
    if (!uploadFiles.length || uploadFiles.some((file) => file.size === 0)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid upload files" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    let calculatedCid: string;
    try {
      calculatedCid = await calculateCidFromFiles(uploadFiles);
    } catch (error: any) {
      return new Response(
        JSON.stringify({
          success: false,
          error: error?.message ?? "Failed to calculate CID from files",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    if (calculatedCid !== body.cid) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `CID mismatch: expected ${body.cid}, got ${calculatedCid}`,
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    async function uploadToFilebase(): Promise<void> {
      await withExponentialBackoff(async () => {
        const formData = new FormData();
        for (const file of uploadFiles) {
          formData.append("file", file, file.name);
        }

        const res = await fetch(
          "https://rpc.filebase.io/api/v0/add?wrap-with-directory=true&cid-version=1&raw-leaves=true",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${env.FILEBASE_TOKEN}`,
            },
            body: formData,
          },
        );

        if (!res.ok) {
          throw new Error(`Filebase HTTP ${res.status}`);
        }

        const text = await res.text();
        const finalHash = extractFinalHash(text);
        if (!finalHash) {
          throw new Error("Filebase add response did not include a root CID");
        }
        if (finalHash !== body.cid) {
          throw new Error(
            `Filebase CID mismatch: expected ${body.cid}, got ${finalHash}`,
          );
        }
      }, FILEBASE_MAX_ATTEMPTS);
    }

    async function pinCidOnPinata(): Promise<void> {
      if (!env.PINATA_JWT) {
        throw new Error("Pinata JWT not configured");
      }

      await withExponentialBackoff(async () => {
        const payload: Record<string, unknown> = {
          cid: body.cid,
          name: body.cid,
        };

        if (env.PINATA_GROUP_ID) {
          payload.group_id = env.PINATA_GROUP_ID;
        }

        const res = await fetch(
          "https://api.pinata.cloud/v3/files/public/pin_by_cid",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${env.PINATA_JWT}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          },
        );

        if (!res.ok) {
          throw new Error(`Pinata HTTP ${res.status}`);
        }

        const data: any = await res.json();
        const cid = data?.data?.cid;
        if (cid && cid !== body.cid) {
          throw new Error("Pinata CID mismatch");
        }
      }, PINATA_MAX_ATTEMPTS);
    }

    try {
      await uploadToFilebase();
    } catch (error: any) {
      return new Response(
        JSON.stringify({
          success: false,
          error: error?.message ?? "Filebase upload failed",
          cid: body.cid,
        }),
        {
          status: 502,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    if (isPinataEnabled(env)) {
      ctx.waitUntil(
        pinCidOnPinata().catch((error) => {
          console.error("Pinata pin by CID failed:", error);
        }),
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        cid: body.cid,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  },
};
