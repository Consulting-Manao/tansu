// src/service/OnChainActivityService.ts
// An account's member-facing contract calls, read from Horizon in one request
// and parsed (`activityQuery`).

import { queryOptions } from "@tanstack/react-query";
import { Buffer } from "buffer";
import * as StellarSdk from "@stellar/stellar-sdk";
import pkgSha3 from "js-sha3";
import { MEMBER_METHODS } from "../constants/onchain";
import { fetchWithin } from "../utils/deadline";

const { keccak_256 } = pkgSha3;

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Generic representation of a member-facing contract call.
 */
export interface OnChainAction {
  /** Transaction hash. */
  txHash: string;
  /** Unix timestamp in **milliseconds**. */
  timestamp: number;
  /** Contract method invoked (register, commit, …). */
  method: string;
  /** Hex-encoded project key if relevant; `null` for `register`. */
  projectKey: string | null;
  /** The project's name, when a `register` in the list gives it. */
  projectName: string | null;
  /** Method-specific details extracted from the arguments (hash, badges, …). */
  details: Record<string, unknown>;
  /** The raw Horizon operation record – used for collapsible debug view. */
  raw: unknown;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Decode a base64 ScVal into the tagged values the activity panel shows. */
function decodeScVal(b64: string): any {
  try {
    return tagScVal(StellarSdk.xdr.ScVal.fromXdr(b64, "base64"));
  } catch {
    return null;
  }
}

function tagScVal(val: any): any {
  switch (val.type) {
    case "scvSymbol":
      return { sym: val.sym.toString() };
    case "scvString":
      return { str: val.str.toString() };
    case "scvBytes":
      return {
        bin: Buffer.from(StellarSdk.scValToNative(val)).toString("base64"),
      };
    case "scvVec":
      return { vec: (val.vec ?? []).map(tagScVal) };
    case "scvI64":
      return { i64: Number(val.i64) };
    case "scvU32":
      return { u32: val.u32 };
    case "scvU64":
      return { u64: Number(val.u64) };
    case "scvI32":
      return { i32: val.i32 };
    case "scvAddress":
      return { address: StellarSdk.Address.fromScVal(val).toString() };
    default:
      return {};
  }
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * An account's member-facing contract calls, latest first. Names come from
 * the `register` calls in the list; others are for the caller to resolve.
 */
export const activityQuery = (accountId: string) =>
  queryOptions({
    queryKey: ["activity", accountId],
    queryFn: () => readActions(accountId),
    staleTime: 60_000,
  });

async function readActions(accountId: string): Promise<OnChainAction[]> {
  // Horizon indexes operations by source account, and a smart account's
  // transactions are sourced by its wallet's relayer: there is nothing to list.
  if (StellarSdk.StrKey.isValidContract(accountId)) return [];

  const base = import.meta.env.PUBLIC_HORIZON_URL;
  const url = `${base}/accounts/${accountId}/operations?limit=200&order=desc`;
  const resp = await fetchWithin(url, {
    headers: { Accept: "application/hal+json" },
  });
  if (!resp.ok) {
    throw new Error(`Horizon error ${resp.status}: ${resp.statusText}`);
  }
  const payload = await resp.json();
  const records: any[] = payload?._embedded?.records ?? [];

  /** Hex project key → name, from the `register` calls of the list. */
  const names = new Map<string, string>();
  const actions: OnChainAction[] = [];
  const memberSet = new Set(MEMBER_METHODS);

  const decodeParam = (p: any): any => {
    if (!p) return null;
    const b64: string | undefined = p.xdr || p.value;
    if (!b64 || typeof b64 !== "string") return null;
    return decodeScVal(b64);
  };

  for (const rec of records) {
    // We only care about Soroban contract calls.
    if (
      rec.type !== "invoke_host_function" ||
      !Array.isArray(rec.parameters) ||
      rec.parameters.length < 2
    ) {
      continue;
    }

    const decodedParams = rec.parameters.map(decodeParam);

    const methodSym = decodedParams[1]?.sym ?? null;
    if (!methodSym || !memberSet.has(methodSym)) continue;

    // Arguments vector is usually param[2].vec
    let argVals: any[] = [];
    if (decodedParams.length >= 3 && Array.isArray(decodedParams[2]?.vec)) {
      argVals = decodedParams[2].vec;
    } else if (decodedParams.length > 2) {
      argVals = decodedParams.slice(2);
    }

    let projectKey: string | null = null;
    let projectName: string | null = null;
    const details: Record<string, unknown> = {};

    const args = argVals;

    // Always keep a raw snapshot so the UI can list every parameter without
    // custom mapping.
    details.params = args;

    // Capture tx-level XDR for eye icon if operation-level missing later
    const txLevelXdr: string | null = rec.transaction_xdr ?? null;

    switch (methodSym) {
      case "register": {
        projectName = paramToString(args[1]); // name is arg1 (maintainer is arg0)
        if (projectName) {
          // keccak key (derived) – used by some off-chain calls.
          // Hash the raw name to match the on-chain contract (case-sensitive),
          // consistent with deriveProjectKey().
          const keyHex = normalizeHex(keccak_256(projectName));
          names.set(keyHex!, projectName);
          details.name = projectName;

          // Extract IPFS CID from the contract call
          details.ipfs = paramToString(args[4]); // ipfs is arg4 (maintainer, name, maintainers, url, ipfs)

          // The contract returns the canonical project_key (Bytes) in the
          // transaction result: the calls that use the raw key (commit, …)
          // get their name from it.
          if (rec.result_xdr) {
            const res = decodeScVal(rec.result_xdr);
            const binHex = paramBytesToHex(res);
            if (binHex) {
              names.set(binHex, projectName);
              projectKey = binHex;
            }
          }
        }
        break;
      }
      case "commit": {
        projectKey = paramBytesToHex(args[1]); // arg0 maintainer, arg1 key
        details.hash = paramToString(args[2]);
        break;
      }
      case "update_config": {
        projectKey = paramBytesToHex(args[1]);
        details.url = paramToString(args[3]);
        details.ipfs = paramToString(args[4]); // ipfs is arg4 (maintainer, key, maintainers, url, ipfs)
        break;
      }
      case "add_member": {
        // Membership registration – no project key; first arg is the member address
        details.member = paramToString(args[0]);
        // Meta hash for IPFS may be arg1; store it for UI
        details.meta = paramToString(args[1]);
        break;
      }
      case "set_badges": {
        projectKey = paramBytesToHex(args[1]);
        details.member = paramToString(args[2]);
        const badgeVecObj = args[3];
        details.badges = extractBadgeInts(badgeVecObj);
        break;
      }
      case "create_proposal": {
        projectKey = paramBytesToHex(args[1]);
        details.title = paramToString(args[2]);
        break;
      }
      case "vote":
      case "execute": {
        projectKey = paramBytesToHex(args[1]);
        details.proposalId = Number(paramToString(args[2]));
        break;
      }
    }

    // Generic detection – if projectKey not yet set, find first bytes/hex
    if (!projectKey) {
      for (const av of args) {
        const hex = paramBytesToHex(av);
        if (hex && hex.length === 64) {
          // 32 bytes
          projectKey = hex;
          break;
        }
      }
    }

    if (projectKey && projectName) {
      names.set(normalizeHex(projectKey)!, projectName);
    }

    actions.push({
      txHash: rec.transaction_hash,
      timestamp: Date.parse(rec.created_at),
      method: methodSym,
      projectKey,
      projectName,
      details,
      raw: { ...rec, __tx_xdr: txLevelXdr },
    });
  }

  // Name the calls made before their project's register (the list is
  // latest first).
  for (const a of actions) {
    if (!a.projectName && a.projectKey) {
      a.projectName = names.get(normalizeHex(a.projectKey)!) ?? null;
    }
  }

  return actions;
}

// helper to extract string from param
function paramToString(arg: any): string | null {
  if (!arg) return null;
  if (typeof arg === "string" || typeof arg === "number") return String(arg);
  if (typeof arg.str === "string") return arg.str;
  if (typeof arg.address === "string") return arg.address;
  if (typeof arg.sym === "string") return arg.sym;
  if (typeof arg.value === "string") return arg.value;
  if (
    typeof arg.i64 === "number" ||
    typeof arg.u64 === "number" ||
    typeof arg.i32 === "number" ||
    typeof arg.u32 === "number"
  ) {
    return String(arg.i64 ?? arg.u64 ?? arg.i32 ?? arg.u32);
  }
  return null;
}

function paramBytesToHex(arg: any): string | null {
  const b64 = arg?.bin ?? arg?.bytes ?? arg?.value;
  if (!b64) return null;
  try {
    return Buffer.from(b64, "base64").toString("hex");
  } catch {
    return null;
  }
}

function extractBadgeInts(vecObj: any): number[] {
  if (!vecObj || !Array.isArray(vecObj.vec)) return [];
  return vecObj.vec
    .map((v: any) => {
      if (typeof v.u32 === "number") return v.u32;
      if (typeof v.u64 === "number") return v.u64;
      if (typeof v.i32 === "number") return v.i32;
      if (typeof v.i64 === "number") return v.i64;
      return null;
    })
    .filter((n: any): n is number => n !== null);
}

// helper
function normalizeHex(hex: string | null): string | null {
  if (!hex) return null;
  return hex.toLowerCase().padStart(64, "0");
}
