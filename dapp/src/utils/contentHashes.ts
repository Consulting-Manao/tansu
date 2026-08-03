/**
 * Lightweight validators for the content-addressed identifiers Tansu handles:
 * IPFS CIDs and Git commit hashes.
 *
 * These are intentionally small, dependency-free predicates so they can be
 * reused in services, React components and Zod schemas without pulling in extra
 * machinery. They perform structural checks, not full cryptographic decoding.
 */

// --- IPFS CID -------------------------------------------------------------

/**
 * Matches the CID shapes Tansu produces and consumes:
 *  - CIDv0: base58btc, always starts with "Qm" (46 chars total)
 *  - CIDv1: base32 lowercase, in practice starts with "bafy" for the
 *    dag-pb/dag-cbor payloads we pin
 *
 * This is a light structural check, not a full multibase/multihash decode.
 */
export const CID_PATTERN = /^(bafy|Qm)[a-zA-Z0-9]{44,}$/;

/** Returns true when `value` structurally looks like a supported IPFS CID. */
export function isValidCid(value: unknown): value is string {
  return typeof value === "string" && CID_PATTERN.test(value);
}

// --- Git commit hash ------------------------------------------------------

/** Length of a hex-encoded SHA-1 object name (Git's current default). */
export const GIT_SHA1_HEX_LENGTH = 40;
/** Length of a hex-encoded SHA-256 object name (Git's SHA-256 object format). */
export const GIT_SHA256_HEX_LENGTH = 64;

/**
 * Git object names are hex-encoded digests. Today that means SHA-1 (40 hex
 * chars); Git's SHA-256 object format — the "git v3" transition — produces
 * 64 hex chars. Accept either length so validation keeps working as
 * repositories migrate. Hex is matched case-insensitively; a robust check must
 * not assume a fixed length or a single algorithm.
 */
export const COMMIT_HASH_PATTERN = new RegExp(
  `^(?:[0-9a-fA-F]{${GIT_SHA1_HEX_LENGTH}}|[0-9a-fA-F]{${GIT_SHA256_HEX_LENGTH}})$`,
);

/** Returns true when `value` is a full-length SHA-1 or SHA-256 Git object name. */
export function isValidCommitHash(value: unknown): value is string {
  return typeof value === "string" && COMMIT_HASH_PATTERN.test(value);
}

// --- Form-friendly variants ----------------------------------------------
// Return an error message string, or null when valid, matching the convention
// used elsewhere in dapp/src/utils/validations.ts.

/** Validate an IPFS CID for form input. Returns an error message or null. */
export function validateCid(value: string): string | null {
  if (!value || value.trim() === "") {
    return "CID is required";
  }
  if (!isValidCid(value)) {
    return "Invalid IPFS CID";
  }
  return null;
}

/** Validate a Git commit hash for form input. Returns an error message or null. */
export function validateCommitHash(value: string): string | null {
  if (!value || value.trim() === "") {
    return "Commit hash is required";
  }
  if (!isValidCommitHash(value)) {
    return `Commit hash must be a ${GIT_SHA1_HEX_LENGTH}-character (SHA-1) or ${GIT_SHA256_HEX_LENGTH}-character (SHA-256) hex string`;
  }
  return null;
}
