/**
 * Cloudflare Worker for delegated IPFS uploads.
 *
 * The dapp sends the CAR payload plus a proof: the already-signed transaction
 * that will later be submitted on-chain, or the hash of a transaction that a
 * wallet already submitted with this CID. Either must call the Tansu contract
 * with the CID. The worker verifies the proof, uploads the CAR to Filebase,
 * then optionally pins the resulting CID on Pinata in the background.
 */

import {
  Address,
  FeeBumpTransaction,
  Keypair,
  Transaction,
  TransactionBuilder,
  scValToNative,
  type xdr,
} from "@stellar/stellar-sdk";
import { CarReader } from "@ipld/car";

export interface Env {
  FILEBASE_TOKEN: string;
  PINATA_JWT?: string;
  PINATA_GROUP_ID?: string;
  ENABLE_PINATA_PINNING?: string;
  /** The network the dapp's transactions are for. */
  NETWORK_PASSPHRASE: string;
  /** The Tansu contract an upload's transaction must call. */
  TANSU_CONTRACT_ID: string;
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
/** A proposal with its images, with room to spare. */
const MAX_CAR_BYTES = 50 * 1024 * 1024;
/** An envelope signed for upload is sent right after: it expires soon. */
const MAX_ENVELOPE_LIFETIME_S = 3600;

function isPinataEnabled(env: Env): boolean {
  return env.ENABLE_PINATA_PINNING === "true";
}

function getCorsHeaders(origin: string | null): Record<string, string> {
  if (!origin) return {};

  // A `*` stands for one DNS label's characters; everything else is literal.
  const isAllowed = ALLOWED_ORIGINS.some(
    (allowed) =>
      allowed === origin ||
      new RegExp(
        `^${allowed
          .split("*")
          .map((part) => part.replace(/[.+?^${}()|[\]\\/-]/g, "\\$&"))
          .join("[a-z0-9-]+")}$`,
      ).test(origin),
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

/** Whether `value`, or a value nested in it, is the string `text`. */
function holdsString(value: xdr.ScVal, text: string): boolean {
  switch (value.type) {
    case "scvString":
      return scValToNative(value) === text;
    case "scvVec":
      return (value.vec ?? []).some((item) => holdsString(item, text));
    case "scvMap":
      return (value.map ?? []).some((entry) => holdsString(entry.val, text));
    default:
      return false;
  }
}

/** Whether `tx` calls the Tansu contract with `cid` among its arguments. */
export function callsTansuWith(
  tx: Transaction,
  cid: string,
  tansuContractId: string,
): boolean {
  return tx.operations.some((op) => {
    if (op.type !== "invokeHostFunction") return false;
    if (op.func.type !== "hostFunctionTypeInvokeContract") return false;
    const call = op.func.invokeContract;
    return (
      Address.fromScAddress(call.contractAddress).toString() ===
        tansuContractId && call.args.some((arg) => holdsString(arg, cid))
    );
  });
}

/**
 * Check the envelope the dapp is about to send: for this network, signed by
 * its source, expiring within the hour, and calling Tansu with `cid`.
 */
export function validateSignedTransaction(
  signedTxXdr: string,
  cid: string,
  env: Pick<Env, "NETWORK_PASSPHRASE" | "TANSU_CONTRACT_ID">,
): void {
  let tx: Transaction;
  try {
    tx = new Transaction(signedTxXdr, env.NETWORK_PASSPHRASE);
  } catch {
    throw new Error("Transaction signature is invalid for the source account");
  }
  const source = Keypair.fromPublicKey(tx.source);
  const hash = tx.hash();
  if (!tx.signatures.some((s) => source.verify(hash, s.signature))) {
    throw new Error("Transaction signature is invalid for the source account");
  }

  const maxTime = Number(tx.timeBounds?.maxTime ?? 0);
  const now = Date.now() / 1000;
  if (!maxTime || maxTime < now || maxTime > now + MAX_ENVELOPE_LIFETIME_S) {
    throw new Error("Transaction must expire within the hour");
  }

  if (!callsTansuWith(tx, cid, env.TANSU_CONTRACT_ID)) {
    throw new Error(`Transaction does not record ${cid} with Tansu`);
  }
}

/**
 * Check that `txHash` is a successful transaction calling Tansu with `cid`.
 *
 * Smart-account wallets (Nido) submit through their own relayer, so the dapp
 * holds no envelope signed by its source and uploads once the transaction has
 * landed. The CAR root must equal `cid`, so a replay can only upload content
 * already recorded on-chain.
 */
export async function validateSubmittedTransaction(
  txHash: string,
  cid: string,
  env: Pick<
    Env,
    "NETWORK_PASSPHRASE" | "TANSU_CONTRACT_ID" | "SOROBAN_RPC_URL"
  >,
): Promise<void> {
  if (!env.SOROBAN_RPC_URL) {
    throw new Error("Transaction hash proofs are not configured");
  }
  if (!/^[0-9a-f]{64}$/i.test(txHash)) {
    throw new Error("Invalid transaction hash");
  }

  const res = await fetch(env.SOROBAN_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getTransaction",
      params: { hash: txHash },
    }),
    signal: AbortSignal.timeout(10_000),
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
  const envelope = TransactionBuilder.fromXDR(
    result.envelopeXdr,
    env.NETWORK_PASSPHRASE,
  );
  const tx =
    envelope instanceof FeeBumpTransaction
      ? envelope.innerTransaction
      : envelope;
  if (!callsTansuWith(tx, cid, env.TANSU_CONTRACT_ID)) {
    throw new Error(`Transaction ${txHash} does not record ${cid}`);
  }
}

export async function calculateCidFromCar(carBlob: Blob): Promise<string> {
  const reader = await CarReader.fromBytes(
    new Uint8Array(await carBlob.arrayBuffer()),
  );
  const roots = await reader.getRoots();
  if (roots.length !== 1) {
    throw new Error(
      roots.length
        ? "CAR file must have one root"
        : "CAR file has no declared root",
    );
  }
  return roots[0]!.toString();
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
      // Base64 takes 4 bytes per 3 of the CAR.
      const length = Number(request.headers.get("Content-Length") ?? 0);
      if (length > (MAX_CAR_BYTES * 4) / 3 + 64 * 1024) {
        throw new Error("Upload too large");
      }
      body = (await request.json()) as UploadRequest;
      validateUploadRequest(body);
      if (body.txHash) {
        await validateSubmittedTransaction(body.txHash, body.cid, env);
      } else {
        validateSignedTransaction(body.signedTxXdr!, body.cid, env);
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
    if (carBlob.size === 0 || carBlob.size > MAX_CAR_BYTES) {
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
          signal: AbortSignal.timeout(60_000),
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
            signal: AbortSignal.timeout(30_000),
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
