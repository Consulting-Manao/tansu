/**
 * Cloudflare Worker for delegated IPFS uploads.
 *
 * The dapp sends the CAR payload plus a proof: the hash of the transaction
 * that recorded the CID with Tansu, once it landed. The worker verifies the
 * proof, checks the CAR is exactly the content of that CID (`car.ts`), uploads
 * it to Filebase, then optionally pins the resulting CID on Pinata in the
 * background. A landed transaction paid for its CID, and an account may have
 * only so much pinned in a day (`quota.ts`).
 */

import {
  Address,
  FeeBumpTransaction,
  Transaction,
  TransactionBuilder,
  scValToNative,
} from "@stellar/stellar-sdk";
import { verifiedRoot } from "./car";

export { UploadQuota } from "./quota";

export interface Env {
  FILEBASE_TOKEN: string;
  PINATA_JWT?: string;
  PINATA_GROUP_ID?: string;
  ENABLE_PINATA_PINNING?: string;
  /** The network the dapp's transactions are for. */
  NETWORK_PASSPHRASE: string;
  /** The Tansu contract an upload's transaction must call. */
  TANSU_CONTRACT_ID: string;
  /** Soroban RPC that checks `txHash` proofs. */
  SOROBAN_RPC_URL: string;
  /** The largest CAR taken, in bytes: a variable, per environment. */
  MAX_CAR_BYTES: string;
  /** One `UploadQuota` Durable Object per account that signed the call. */
  UPLOAD_QUOTA: DurableObjectNamespace;
  /** Uploads one address may ask for in a minute. */
  RATE_LIMIT: {
    limit(options: { key: string }): Promise<{ success: boolean }>;
  };
}

interface WorkerExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

interface UploadRequest {
  cid: string;
  car: string;
  /** Hash of the transaction that landed with this CID. */
  txHash: string;
}

const ALLOWED_ORIGINS = [
  "http://localhost:4321",
  "https://testnet.tansu.dev",
  "https://app.tansu.dev",
  "https://tansu.xlm.sh",
  "https://deploy-preview-*--staging-tansu.netlify.app",
];
const FILEBASE_MAX_ATTEMPTS = 3;
const RPC_MAX_ATTEMPTS = 3;
const PINATA_MAX_ATTEMPTS = 3;
const FILEBASE_PIN_LS = "https://rpc.filebase.io/api/v0/pin/ls";
/** The empty directory: pinned or not, Filebase answers about it. */
const HEALTH_PROBE_CID =
  "bafybeiczsscdsbs7ffqz55asqdf3smv6klcw3gofszvwlyarci47bgf354";
const HEALTH_TTL_MS = 30_000;
/** Asks of `getTransaction` for a hash the RPC may not know yet. */
const LANDED_MAX_ATTEMPTS = 4;

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
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export function validateUploadRequest(body: UploadRequest): void {
  const { cid, txHash, car } = body;

  if (!cid || !car || !txHash) {
    throw new Error("Missing required fields: cid, car and txHash");
  }
}

/**
 * For each Tansu function that records a CID, where the CID is among its
 * arguments and where the address that authorizes the call is. Only the
 * argument named here counts, so a CID tucked in another one proves nothing.
 */
const CID_CALLS: Record<string, { actor: number; cid: number }> = {
  add_member: { actor: 0, cid: 1 },
  update_member: { actor: 0, cid: 1 },
  register: { actor: 0, cid: 4 },
  update_config: { actor: 0, cid: 4 },
  set_evidence: { actor: 0, cid: 5 },
  create_proposal: { actor: 0, cid: 4 },
  veto: { actor: 0, cid: 4 },
};

/**
 * The address that authorized a call of `tx` recording `cid` with Tansu, or
 * undefined when `tx` has none. The address is the account the upload counts
 * against: a relayer pays the fee of a smart account's transactions, so their
 * source account would be shared by all its users.
 */
export function uploadActor(
  tx: Transaction,
  cid: string,
  tansuContractId: string,
): string | undefined {
  for (const op of tx.operations) {
    if (op.type !== "invokeHostFunction") continue;
    if (op.func.type !== "hostFunctionTypeInvokeContract") continue;
    const call = op.func.invokeContract;
    if (
      Address.fromScAddress(call.contractAddress).toString() !== tansuContractId
    ) {
      continue;
    }
    const spec = CID_CALLS[String(call.functionName)];
    const recorded = spec && call.args[spec.cid];
    const actor = spec && call.args[spec.actor];
    if (
      recorded?.type === "scvString" &&
      scValToNative(recorded) === cid &&
      actor?.type === "scvAddress"
    ) {
      return Address.fromScVal(actor).toString();
    }
  }
  return undefined;
}

/** The Soroban RPC did not answer: not the caller's fault. */
class UpstreamError extends Error {}

async function rpc<T>(
  env: Pick<Env, "SOROBAN_RPC_URL">,
  method: string,
  params: Record<string, unknown>,
): Promise<T> {
  return withExponentialBackoff(async () => {
    try {
      const res = await fetch(env.SOROBAN_RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return ((await res.json()) as { result: T }).result;
    } catch (error: any) {
      throw new UpstreamError(
        `Soroban RPC did not answer ${method}: ${error?.message ?? error}`,
      );
    }
  }, RPC_MAX_ATTEMPTS);
}

/**
 * Check that `txHash` is a successful transaction recording `cid` with Tansu.
 * Returns the address that authorized the call (see `uploadActor`).
 *
 * Smart-account wallets (Nido) submit through their own relayer, and the dapp
 * uploads once the transaction has landed. The CAR is exactly the content of
 * `cid`, so a replay can only upload content already recorded on-chain.
 * An RPC node that lags answers "not found" for a transaction that landed:
 * it is asked again a few times before that is believed.
 */
export async function validateSubmittedTransaction(
  txHash: string,
  cid: string,
  env: Pick<
    Env,
    "NETWORK_PASSPHRASE" | "TANSU_CONTRACT_ID" | "SOROBAN_RPC_URL"
  >,
): Promise<string> {
  if (!/^[0-9a-f]{64}$/i.test(txHash)) {
    throw new Error("Invalid transaction hash");
  }

  let result;
  for (let attempt = 1; ; attempt += 1) {
    result = await rpc<{ status?: string; envelopeXdr?: string }>(
      env,
      "getTransaction",
      { hash: txHash },
    );
    if (result?.status !== "NOT_FOUND" || attempt === LANDED_MAX_ATTEMPTS)
      break;
    await sleep(500 * 2 ** attempt);
  }
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
  const actor = uploadActor(tx, cid, env.TANSU_CONTRACT_ID);
  if (!actor) throw new Error(`Transaction ${txHash} does not record ${cid}`);
  return actor;
}

/**
 * What the Filebase bucket says about `cid`: pinned, absent, or unknown when
 * it does not answer: unreachable, no JSON, the token refused or throttled, a
 * server error. Kubo, which Filebase follows, answers 200 with the key for a
 * pinned CID and an error "is not pinned" for the others; any other answer
 * that is JSON and a client error is taken as "not pinned", so a different
 * wording cannot make the bucket look down.
 */
export async function pinStatus(
  cid: string,
  env: Pick<Env, "FILEBASE_TOKEN">,
): Promise<"pinned" | "absent" | "unknown"> {
  try {
    const res = await fetch(`${FILEBASE_PIN_LS}?arg=${cid}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.FILEBASE_TOKEN}` },
      signal: AbortSignal.timeout(5_000),
    });
    const body = (await res.json()) as {
      Keys?: Record<string, unknown>;
      Message?: string;
    };
    if (res.ok && body.Keys?.[cid]) return "pinned";
    if (res.ok || /not pinned/i.test(body.Message ?? "")) return "absent";
    if (
      res.status >= 400 &&
      res.status < 500 &&
      ![401, 403, 429].includes(res.status)
    ) {
      return "absent";
    }
  } catch {
    // Unreachable or not JSON: not known.
  }
  return "unknown";
}

let health: { at: number; ok: boolean } | undefined;

/** Whether Filebase answers us; kept for a while so this cannot hammer it. */
async function filebaseLive(env: Pick<Env, "FILEBASE_TOKEN">) {
  if (!health || Date.now() - health.at > HEALTH_TTL_MS) {
    health = {
      at: Date.now(),
      ok: (await pinStatus(HEALTH_PROBE_CID, env)) !== "unknown",
    };
  }
  return health.ok;
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

    if (
      request.method === "GET" &&
      new URL(request.url).pathname === "/health"
    ) {
      const ok = await filebaseLive(env);
      return new Response(JSON.stringify({ ok }), {
        status: ok ? 200 : 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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

    const reply = (
      status: number,
      payload: Record<string, unknown>,
      headers: Record<string, string> = {},
    ) =>
      new Response(JSON.stringify(payload), {
        status,
        headers: {
          ...corsHeaders,
          ...headers,
          "Content-Type": "application/json",
        },
      });
    const refuse = (error: string) => reply(400, { success: false, error });

    const address = request.headers.get("CF-Connecting-IP") ?? "unknown";
    if (!(await env.RATE_LIMIT.limit({ key: address })).success) {
      return reply(
        429,
        { success: false, error: "Too many uploads from this address" },
        { "Retry-After": "60" },
      );
    }

    const maxCarBytes = Number(env.MAX_CAR_BYTES);
    let body: UploadRequest;
    let actor: string;
    try {
      // Base64 takes 4 bytes per 3 of the CAR. The body is read up to that
      // and no further, whatever its Content-Length says.
      const limit = (maxCarBytes * 4) / 3 + 64 * 1024;
      let size = 0;
      body = (await new Response(
        request.body?.pipeThrough(
          new TransformStream<Uint8Array, Uint8Array>({
            transform(chunk, controller) {
              size += chunk.length;
              if (size > limit) {
                controller.error(new Error("Upload too large"));
              } else {
                controller.enqueue(chunk);
              }
            },
          }),
        ),
      ).json()) as UploadRequest;
      validateUploadRequest(body);
      actor = await validateSubmittedTransaction(body.txHash, body.cid, env);
    } catch (error: any) {
      return error instanceof UpstreamError
        ? reply(502, { success: false, error: error.message })
        : refuse(error?.message ?? "Invalid upload request");
    }

    // Only a transaction that landed gets this far: the CAR is decoded last.
    let bytes: Uint8Array;
    try {
      bytes = Uint8Array.from(atob(body.car), (char) => char.charCodeAt(0));
    } catch {
      return refuse("Invalid CAR body");
    }
    if (bytes.length === 0 || bytes.length > maxCarBytes) {
      return refuse("Invalid CAR body");
    }

    let root: string;
    try {
      root = await verifiedRoot(bytes);
    } catch (error: any) {
      return refuse(error?.message ?? "Invalid CAR body");
    }
    if (root !== body.cid) {
      return refuse(`CID mismatch: expected ${body.cid}, got ${root}`);
    }
    const carBlob = new Blob([bytes], { type: "application/vnd.ipld.car" });

    // Already in the bucket: nothing to upload, nothing to count. This is
    // also what makes asking again after a failed answer harmless.
    if ((await pinStatus(body.cid, env)) === "pinned") {
      return reply(200, { success: true, cid: body.cid, alreadyPinned: true });
    }

    const quota = env.UPLOAD_QUOTA.get(env.UPLOAD_QUOTA.idFromName(actor));
    const ask = async (action: "reserve" | "release") =>
      (await (
        await quota.fetch("https://quota", {
          method: "POST",
          body: JSON.stringify({ action, cid: body.cid, bytes: carBlob.size }),
        })
      ).json()) as { ok: boolean; retryAfter?: number };
    const { ok, retryAfter } = await ask("reserve");
    if (!ok) {
      return reply(
        429,
        {
          success: false,
          error: "Upload quota of this account reached for today",
        },
        { "Retry-After": String(retryAfter) },
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
      await ask("release");
      return reply(502, {
        success: false,
        error: error?.message ?? "Filebase upload failed",
        cid: body.cid,
      });
    }

    if (isPinataEnabled(env)) {
      ctx.waitUntil(
        pinCidOnPinata().catch((error) => {
          console.error("Pinata pin by CID failed:", error);
        }),
      );
    }

    return reply(200, { success: true, cid: body.cid });
  },
};
