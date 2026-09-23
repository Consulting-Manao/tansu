/**
 * Cloudflare Worker for delegated IPFS uploads.
 *
 * The dapp sends the CAR payload plus a proof: the already-signed transaction
 * that will later be submitted on-chain, or the hash of a transaction that a
 * wallet already submitted with this CID. The worker verifies the proof,
 * uploads the CAR to Filebase, then optionally pins the resulting CID on
 * Pinata in the background.
 */

import { Keypair, Networks, Transaction, xdr } from "@stellar/stellar-sdk";
import { CarReader } from "@ipld/car";

export interface Env {
  FILEBASE_TOKEN: string;
  PINATA_JWT?: string;
  PINATA_GROUP_ID?: string;
  ENABLE_PINATA_PINNING?: string;
  /** Soroban RPC used to check `txHash` proofs. Unset disables them. */
  SOROBAN_RPC_URL?: string;
}

interface WorkerExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

interface UploadRequest {
  cid: string;
  car: string;
  /** Signed envelope of the transaction the dapp is about to send. */
  signedTxXdr?: string;
  /** Hash of a transaction a wallet already submitted (smart accounts). */
  txHash?: string;
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

export function buildUploadBlob(base64Car: string): Blob {
  const bytes = new Uint8Array(decodeBase64(base64Car));
  return new Blob([bytes], {
    type: "application/vnd.ipld.car",
  });
}

export function validateUploadRequest(body: UploadRequest): void {
  const { cid, signedTxXdr, txHash, car } = body;

  if (!cid || !car || !signedTxXdr === !txHash) {
    throw new Error(
      "Missing required fields: cid, car and either signedTxXdr or txHash",
    );
  }
}

export function validateSignedTransaction(signedTxXdr: string): void {
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

/**
 * Check that `txHash` is a successful transaction passing `cid` to a contract.
 *
 * Smart-account wallets (Nido) submit through their own relayer, so the dapp
 * holds no envelope signed by its source and uploads once the transaction has
 * landed. The CAR root must equal `cid`, so a replay can only upload content
 * already recorded on-chain.
 */
export async function validateSubmittedTransaction(
  txHash: string,
  cid: string,
  rpcUrl: string | undefined,
): Promise<void> {
  if (!rpcUrl) {
    throw new Error("Transaction hash proofs are not configured");
  }
  if (!/^[0-9a-f]{64}$/i.test(txHash)) {
    throw new Error("Invalid transaction hash");
  }

  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getTransaction",
      params: { hash: txHash },
    }),
  });
  if (!res.ok) {
    throw new Error(`Soroban RPC HTTP ${res.status}`);
  }
  const { result } = (await res.json()) as {
    result?: { status?: string; envelopeXdr?: string };
  };
  if (result?.status !== "SUCCESS" || !result.envelopeXdr) {
    throw new Error(
      `Transaction ${txHash} did not succeed on-chain (${result?.status ?? "unknown"})`,
    );
  }

  // Relayers wrap the transaction in a fee bump.
  const envelope = xdr.TransactionEnvelope.fromXDR(
    result.envelopeXdr,
    "base64",
  );
  const tx =
    envelope.switch() === xdr.EnvelopeType.envelopeTypeTxFeeBump()
      ? envelope.feeBump().tx().innerTx().v1().tx()
      : envelope.v1().tx();

  const recordsCid = tx.operations().some((op) => {
    const body = op.body();
    if (body.switch() !== xdr.OperationType.invokeHostFunction()) return false;
    const fn = body.invokeHostFunctionOp().hostFunction();
    if (fn.switch() !== xdr.HostFunctionType.hostFunctionTypeInvokeContract()) {
      return false;
    }
    return fn
      .invokeContract()
      .args()
      .some(
        (arg) =>
          arg.switch() === xdr.ScValType.scvString() &&
          arg.str().toString() === cid,
      );
  });
  if (!recordsCid) {
    throw new Error(`Transaction ${txHash} does not record ${cid}`);
  }
}

export async function calculateCidFromCar(carBlob: Blob): Promise<string> {
  const reader = await CarReader.fromBytes(
    new Uint8Array(await carBlob.arrayBuffer()),
  );
  const roots = await reader.getRoots();
  if (!roots[0]) {
    throw new Error("CAR file has no declared root");
  }
  return roots[0].toString();
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

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: WorkerExecutionContext,
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
      if (body.txHash) {
        await validateSubmittedTransaction(
          body.txHash,
          body.cid,
          env.SOROBAN_RPC_URL,
        );
      } else {
        validateSignedTransaction(body.signedTxXdr!);
      }
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

    const carBlob = buildUploadBlob(body.car);
    if (carBlob.size === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid CAR body" }),
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
      calculatedCid = await calculateCidFromCar(carBlob);
    } catch (error: any) {
      return new Response(
        JSON.stringify({
          success: false,
          error: error?.message ?? "Failed to calculate CID from CAR",
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
        formData.append("file", carBlob, `${body.cid}.car`);

        const res = await fetch("https://rpc.filebase.io/api/v0/dag/import", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.FILEBASE_TOKEN}`,
          },
          body: formData,
        });

        if (!res.ok) {
          throw new Error(`Filebase HTTP ${res.status}`);
        }

        const text = await res.text();
        try {
          const json = JSON.parse(text);
          const returnedCid =
            json?.Cid?.["/"] ?? json?.Root?.Cid?.["/"] ?? null;
          if (returnedCid && returnedCid !== body.cid) {
            throw new Error("Filebase CID mismatch");
          }
        } catch {
          if (text && !text.includes(body.cid)) {
            throw new Error("Filebase response does not confirm expected CID");
          }
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
          name: `${body.cid}.car`,
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
