import { Buffer } from "buffer";
import * as pkg from "js-sha3";

const { keccak256 } = pkg;

/**
 * Derive the canonical project key from a project name.
 * Hashes the raw name (case-sensitive) to match the on-chain contract. Do NOT
 * lowercase: the contract treats "MyProject" and "myproject" as distinct keys.
 */
export function deriveProjectKey(projectName: string): Buffer {
  return Buffer.from(keccak256.create().update(projectName).digest());
}

/** The project key in hex, as query keys and the UI show it. */
export function projectKeyHex(projectName: string): string {
  return deriveProjectKey(projectName).toString("hex");
}
