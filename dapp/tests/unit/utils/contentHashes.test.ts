import { describe, it, expect } from "vitest";
import {
  isValidCid,
  validateCid,
  isValidCommitHash,
  validateCommitHash,
} from "../../../src/utils/contentHashes";

const cidV0 = "Qm" + "a".repeat(44); // 46 chars, base58-ish
const cidV1 = "bafy" + "a".repeat(55);
const sha1 = "a".repeat(40);
const sha256 = "0".repeat(64);

describe("isValidCid", () => {
  it("accepts a CIDv0 (Qm...)", () => {
    expect(isValidCid(cidV0)).toBe(true);
  });

  it("accepts a CIDv1 (bafy...)", () => {
    expect(isValidCid(cidV1)).toBe(true);
  });

  it("rejects an unknown prefix", () => {
    expect(isValidCid("zdj7" + "a".repeat(44))).toBe(false);
  });

  it("rejects a too-short CID", () => {
    expect(isValidCid("Qmabc")).toBe(false);
  });

  it("rejects empty and non-string input", () => {
    expect(isValidCid("")).toBe(false);
    expect(isValidCid(undefined)).toBe(false);
    expect(isValidCid(null)).toBe(false);
    expect(isValidCid(42)).toBe(false);
  });
});

describe("validateCid", () => {
  it("returns null for a valid CID", () => {
    expect(validateCid(cidV1)).toBeNull();
  });

  it("returns a required message for empty input", () => {
    expect(validateCid("")).toBe("CID is required");
    expect(validateCid("   ")).toBe("CID is required");
  });

  it("returns an error for malformed input", () => {
    expect(validateCid("not-a-cid")).toBe("Invalid IPFS CID");
  });
});

describe("isValidCommitHash", () => {
  it("accepts a 40-char SHA-1 hash", () => {
    expect(isValidCommitHash(sha1)).toBe(true);
  });

  it("accepts a 64-char SHA-256 hash (git v3)", () => {
    expect(isValidCommitHash(sha256)).toBe(true);
  });

  it("accepts uppercase hex", () => {
    expect(isValidCommitHash("A".repeat(40))).toBe(true);
    expect(isValidCommitHash("F".repeat(64))).toBe(true);
  });

  it("rejects intermediate lengths (e.g. abbreviated hashes)", () => {
    expect(isValidCommitHash("a".repeat(7))).toBe(false);
    expect(isValidCommitHash("a".repeat(41))).toBe(false);
    expect(isValidCommitHash("a".repeat(63))).toBe(false);
  });

  it("rejects non-hex characters", () => {
    expect(isValidCommitHash("g".repeat(40))).toBe(false);
    expect(isValidCommitHash("z".repeat(64))).toBe(false);
  });

  it("rejects empty and non-string input", () => {
    expect(isValidCommitHash("")).toBe(false);
    expect(isValidCommitHash(undefined)).toBe(false);
    expect(isValidCommitHash(null)).toBe(false);
  });
});

describe("validateCommitHash", () => {
  it("returns null for a valid SHA-1 hash", () => {
    expect(validateCommitHash(sha1)).toBeNull();
  });

  it("returns null for a valid SHA-256 hash", () => {
    expect(validateCommitHash(sha256)).toBeNull();
  });

  it("returns a required message for empty input", () => {
    expect(validateCommitHash("")).toBe("Commit hash is required");
    expect(validateCommitHash("   ")).toBe("Commit hash is required");
  });

  it("returns a descriptive error for malformed input", () => {
    expect(validateCommitHash("xyz")).toBe(
      "Commit hash must be a 40-character (SHA-1) or 64-character (SHA-256) hex string",
    );
  });
});
