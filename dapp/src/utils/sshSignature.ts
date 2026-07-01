/**
 * Ed25519 signature extraction helpers.
 *
 * Accepts raw base64-encoded 64-byte strings and returns the signature bytes.
 * This is used by the Git identity binding flow to extract Ed25519 signatures
 * that users generate by signing the SEP-53 message with their Git SSH key.
 */

const SSH_SIGNATURE_HEADER = "-----BEGIN SSH SIGNATURE-----";
const SSH_SIGNATURE_FOOTER = "-----END SSH SIGNATURE-----";

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Accept either an OpenSSH armored signature (the full `ssh-keygen -Y sign`
 * output with `-O hashalg=sha256`) or a raw base64-encoded 64-byte string.
 * Returns the extracted 64-byte Ed25519 signature or null on failure.
 *
 * Detection order:
 * 1. OpenSSH armored format (starts with `-----BEGIN SSH SIGNATURE-----`)
 * 2. Raw base64 (try atob, check 64 bytes)
 */
export function extractSignatureBytes(input: string): Uint8Array | null {
  const trimmed = input.trim();

  // 1. OpenSSH armored format — extract the raw 64-byte signature from the
  //    inner SSH wire-format payload.
  if (trimmed.startsWith(SSH_SIGNATURE_HEADER)) {
    const sig = extractFromArmored(trimmed);
    return sig ?? null;
  }

  // 2. Raw base64
  try {
    const bytes = Uint8Array.from(atob(trimmed), (c) => c.charCodeAt(0));
    if (bytes.length === 64) return bytes;
  } catch {
    // Not valid base64 — fall through
  }

  return null;
}

// ── Internal helpers ───────────────────────────────────────────────────────

/**
 * Parse an OpenSSH armored signature block and extract just the 64-byte
 * Ed25519 signature from the inner wire-format payload.
 * Returns null on any parse failure.
 */
function extractFromArmored(armored: string): Uint8Array | null {
  try {
    const lines = armored.trim().split("\n");
    const b64Chunks: string[] = [];
    let inside = false;
    let sawFooter = false;

    for (const line of lines) {
      const chomped = line.trim();
      if (chomped === SSH_SIGNATURE_HEADER) {
        inside = true;
        continue;
      }
      if (chomped === SSH_SIGNATURE_FOOTER) {
        inside = false;
        sawFooter = true;
        continue;
      }
      if (inside && chomped.length > 0) {
        b64Chunks.push(chomped);
      }
    }

    if (b64Chunks.length === 0 || !sawFooter) return null;

    const b64 = b64Chunks.join("");
    const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

    return decodeSshSignaturePayload(raw);
  } catch {
    return null;
  }
}

/**
 * Decode the SSH wire-format payload and extract the Ed25519 signature bytes.
 *
 * Wire format (OpenSSH 9.x+):
 *   byte[6]  "SSHSIG"   — magic (raw, no length prefix)
 *   uint32              — version (1)
 *   string              — public key (key-type + key-material)
 *   string              — namespace
 *   string              — reserved
 *   string              — hash algorithm
 *   string              — signature (key-type + signature-material)
 *
 * Returns the 64-byte Ed25519 signature or null.
 */
function decodeSshSignaturePayload(raw: Uint8Array): Uint8Array | null {
  let offset = 0;

  const u32 = (): number => {
    if (offset + 4 > raw.length) throw new RangeError("short read");
    const v =
      (raw[offset]! << 24) |
      (raw[offset + 1]! << 16) |
      (raw[offset + 2]! << 8) |
      raw[offset + 3]!;
    offset += 4;
    return v >>> 0;
  };

  const str = (): Uint8Array => {
    const len = u32();
    if (offset + len > raw.length) throw new RangeError("short string read");
    const slice = raw.slice(offset, offset + len);
    offset += len;
    return slice;
  };

  try {
    // Magic: 6 raw bytes
    if (offset + 6 > raw.length) return null;
    const magic = new TextDecoder().decode(raw.slice(offset, offset + 6));
    offset += 6;
    if (magic !== "SSHSIG") return null;

    // Version (uint32) — must be 1
    if (u32() !== 1) return null;

    // Skip public key blob, namespace, reserved, hash algorithm
    str(); // public key
    str(); // namespace
    str(); // reserved
    str(); // hash algorithm

    // Signature blob: string("ssh-ed25519") + string(64 bytes)
    const sigBlob = str();
    let sigOffset = 0;
    const sigU32 = (): number => {
      if (sigOffset + 4 > sigBlob.length) return -1;
      const v =
        (sigBlob[sigOffset]! << 24) |
        (sigBlob[sigOffset + 1]! << 16) |
        (sigBlob[sigOffset + 2]! << 8) |
        sigBlob[sigOffset + 3]!;
      sigOffset += 4;
      return v >>> 0;
    };
    const sigInnerStr = (): Uint8Array | null => {
      const len = sigU32();
      if (len < 0 || sigOffset + len > sigBlob.length) return null;
      const slice = sigBlob.slice(sigOffset, sigOffset + len);
      sigOffset += len;
      return slice;
    };

    const sigAlg = sigInnerStr();
    const sigBytes = sigInnerStr();
    if (!sigAlg || !sigBytes) return null;

    const sigAlgStr = new TextDecoder().decode(sigAlg);
    if (sigAlgStr !== "ssh-ed25519" || sigBytes.length !== 64) return null;

    return sigBytes;
  } catch {
    return null;
  }
}
