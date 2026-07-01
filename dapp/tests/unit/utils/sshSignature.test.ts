import { describe, it, expect } from "vitest";
import { extractSignatureBytes } from "utils/sshSignature";

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a minimal valid OpenSSH armored signature around a known 64-byte
 * Ed25519 signature.
 */
function buildOpenSshArmor(sigBytes: Uint8Array): string {
  const enc = new TextEncoder();

  const sshWireStr = (bytes: Uint8Array): Uint8Array => {
    const len = new Uint8Array(4);
    len[0] = (bytes.length >> 24) & 0xff;
    len[1] = (bytes.length >> 16) & 0xff;
    len[2] = (bytes.length >> 8) & 0xff;
    len[3] = bytes.length & 0xff;
    const out = new Uint8Array(4 + bytes.length);
    out.set(len);
    out.set(bytes, 4);
    return out;
  };

  const pubkeyBlob = (pk: Uint8Array): Uint8Array => {
    const keyType = enc.encode("ssh-ed25519");
    const kt = sshWireStr(keyType);
    const pkWire = sshWireStr(pk);
    const blob = new Uint8Array(kt.length + pkWire.length);
    blob.set(kt);
    blob.set(pkWire, kt.length);
    return blob;
  };

  const sigBlob = (sig: Uint8Array): Uint8Array => {
    const keyType = enc.encode("ssh-ed25519");
    const kt = sshWireStr(keyType);
    const sigWire = sshWireStr(sig);
    const blob = new Uint8Array(kt.length + sigWire.length);
    blob.set(kt);
    blob.set(sigWire, kt.length);
    return blob;
  };

  // Full SSH wire format: magic + version + publickey + namespace + reserved + hash_alg + sig
  const magic = enc.encode("SSHSIG");
  const version = new Uint8Array([0, 0, 0, 1]);
  const pk = new Uint8Array(32);
  pk[0] = 0x21;
  pk[1] = 0x52;
  const pkb = pubkeyBlob(pk);
  const pkbWire = sshWireStr(pkb);
  const ns = sshWireStr(enc.encode("file"));
  const reserved = sshWireStr(new Uint8Array(0));
  const ha = sshWireStr(enc.encode("sha512"));
  const sig = sshWireStr(sigBlob(sigBytes));

  const payload = new Uint8Array(
    magic.length +
      version.length +
      pkbWire.length +
      ns.length +
      reserved.length +
      ha.length +
      sig.length,
  );
  let off = 0;
  payload.set(magic, off);
  off += magic.length;
  payload.set(version, off);
  off += version.length;
  payload.set(pkbWire, off);
  off += pkbWire.length;
  payload.set(ns, off);
  off += ns.length;
  payload.set(reserved, off);
  off += reserved.length;
  payload.set(ha, off);
  off += ha.length;
  payload.set(sig, off);

  const b64 = btoa(String.fromCharCode(...payload));
  const MAX_LINE = 64;
  const lines: string[] = ["-----BEGIN SSH SIGNATURE-----"];
  for (let i = 0; i < b64.length; i += MAX_LINE) {
    lines.push(b64.slice(i, i + MAX_LINE));
  }
  lines.push("-----END SSH SIGNATURE-----");
  return lines.join("\n");
}

// Deterministic 64-byte Ed25519 signature
const TEST_SIG = new Uint8Array([
  0xd4, 0x82, 0x93, 0xbb, 0x82, 0x92, 0xb2, 0x7e, 0xcd, 0xbe, 0x06, 0xed, 0x47,
  0xdf, 0x0f, 0x42, 0x7c, 0xff, 0x72, 0xfe, 0xc4, 0x48, 0x63, 0xe6, 0x1a, 0x74,
  0xa5, 0x50, 0x33, 0x49, 0x2e, 0xfe, 0xce, 0xf0, 0xa1, 0xb7, 0xe5, 0x72, 0x4e,
  0xf0, 0x82, 0x73, 0x31, 0xbc, 0xa6, 0x64, 0xba, 0xa9, 0x52, 0xc5, 0xf7, 0xe0,
  0x36, 0x87, 0xb6, 0x57, 0x1f, 0x38, 0xa7, 0xad, 0xec, 0x7d, 0x6f, 0x0f,
]);

// Base64 of TEST_SIG
const TEST_SIG_BASE64 =
  "1IKTu4KSsn7NvgbtR98PQnz/cv7ESGPmGnSlUDNJLv7O8KG35XJO8IJzMbymZLqpUsX34DaHtlcfOKet7H1vDw==";

const VALID_ARMORED = buildOpenSshArmor(TEST_SIG);

// ── extractSignatureBytes – OpenSSH armored format ─────────────────────────

describe("extractSignatureBytes – OpenSSH armored format", () => {
  it("extracts the 64-byte Ed25519 signature from a valid block", () => {
    const result = extractSignatureBytes(VALID_ARMORED);
    expect(result).not.toBeNull();
    expect(result!.length).toBe(64);
    expect(result).toEqual(TEST_SIG);
  });

  it("handles single-line base64 content", () => {
    const b64 = btoa(
      String.fromCharCode(
        ...(() => {
          const inner = VALID_ARMORED.replace(
            "-----BEGIN SSH SIGNATURE-----\n",
            "",
          ).replace("\n-----END SSH SIGNATURE-----", "");
          return Uint8Array.from(atob(inner), (c) => c.charCodeAt(0));
        })(),
      ),
    );
    const singleLine = `-----BEGIN SSH SIGNATURE-----\n${b64}\n-----END SSH SIGNATURE-----`;
    const result = extractSignatureBytes(singleLine);
    expect(result).not.toBeNull();
    expect(result!.length).toBe(64);
  });

  it("rejects a block with wrong magic (SSHKEY instead of SSHSIG)", () => {
    // Manually build a tampered version
    const enc = new TextEncoder();
    const sshWireStr = (bytes: Uint8Array): Uint8Array => {
      const len = new Uint8Array(4);
      len[0] = (bytes.length >> 24) & 0xff;
      len[1] = (bytes.length >> 16) & 0xff;
      len[2] = (bytes.length >> 8) & 0xff;
      len[3] = bytes.length & 0xff;
      const out = new Uint8Array(4 + bytes.length);
      out.set(len);
      out.set(bytes, 4);
      return out;
    };
    const pubkeyBlob = (pk: Uint8Array): Uint8Array => {
      const keyType = enc.encode("ssh-ed25519");
      const kt = sshWireStr(keyType);
      const pkWire = sshWireStr(pk);
      const blob = new Uint8Array(kt.length + pkWire.length);
      blob.set(kt);
      blob.set(pkWire, kt.length);
      return blob;
    };
    const sigBlob = (sig: Uint8Array): Uint8Array => {
      const keyType = enc.encode("ssh-ed25519");
      const kt = sshWireStr(keyType);
      const sigWire = sshWireStr(sig);
      const blob = new Uint8Array(kt.length + sigWire.length);
      blob.set(kt);
      blob.set(sigWire, kt.length);
      return blob;
    };
    const magic = enc.encode("SSHKEY");
    const version = new Uint8Array([0, 0, 0, 1]);
    const pk = new Uint8Array(32);
    pk[0] = 0x21;
    const pkb = pubkeyBlob(pk);
    const pkbWire = sshWireStr(pkb);
    const ns = sshWireStr(enc.encode("file"));
    const reserved = sshWireStr(new Uint8Array(0));
    const ha = sshWireStr(enc.encode("sha512"));
    const sig = sshWireStr(sigBlob(TEST_SIG));
    const payload = new Uint8Array(
      magic.length +
        version.length +
        pkbWire.length +
        ns.length +
        reserved.length +
        ha.length +
        sig.length,
    );
    let off = 0;
    payload.set(magic, off);
    off += magic.length;
    payload.set(version, off);
    off += version.length;
    payload.set(pkbWire, off);
    off += pkbWire.length;
    payload.set(ns, off);
    off += ns.length;
    payload.set(reserved, off);
    off += reserved.length;
    payload.set(ha, off);
    off += ha.length;
    payload.set(sig, off);
    const b64 = btoa(String.fromCharCode(...payload));
    const header = "-----BEGIN SSH SIGNATURE-----\n";
    const footer = "\n-----END SSH SIGNATURE-----";
    const tampered = header + b64 + footer;
    expect(extractSignatureBytes(tampered)).toBeNull();
  });

  it("rejects a block with missing footer", () => {
    const noFooter = VALID_ARMORED.replace("\n-----END SSH SIGNATURE-----", "");
    expect(extractSignatureBytes(noFooter)).toBeNull();
  });

  it("rejects a block with empty base64 body", () => {
    const empty = "-----BEGIN SSH SIGNATURE-----\n-----END SSH SIGNATURE-----";
    expect(extractSignatureBytes(empty)).toBeNull();
  });

  it("rejects a block with non-base64 content", () => {
    const garbage =
      "-----BEGIN SSH SIGNATURE-----\n!!!NOT-BASE64!!!\n-----END SSH SIGNATURE-----";
    expect(extractSignatureBytes(garbage)).toBeNull();
  });

  it("rejects a truncated payload inside the armor", () => {
    const junk = btoa("too short");
    const bad = `-----BEGIN SSH SIGNATURE-----\n${junk}\n-----END SSH SIGNATURE-----`;
    expect(extractSignatureBytes(bad)).toBeNull();
  });
});

// ── extractSignatureBytes – backward compatibility (base64) ────────────────

describe("extractSignatureBytes – backward compat (base64)", () => {
  it("extracts a valid base64-encoded 64-byte signature", () => {
    const result = extractSignatureBytes(TEST_SIG_BASE64);
    expect(result).not.toBeNull();
    expect(result!.length).toBe(64);
    expect(result).toEqual(TEST_SIG);
  });

  it("extracts base64 signature with padding", () => {
    const result = extractSignatureBytes(TEST_SIG_BASE64);
    expect(result).toEqual(TEST_SIG);
  });

  it("rejects base64 string that decodes to wrong length (< 64 bytes)", () => {
    const b64 = btoa("short");
    expect(extractSignatureBytes(b64)).toBeNull();
  });

  it("rejects base64 string that decodes to wrong length (> 64 bytes)", () => {
    const b64 = btoa("a".repeat(128));
    expect(extractSignatureBytes(b64)).toBeNull();
  });
});

// ── extractSignatureBytes – edge cases ──────────────────────────────────────

describe("extractSignatureBytes – edge cases", () => {
  it("returns null for empty string", () => {
    expect(extractSignatureBytes("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(extractSignatureBytes("   \n  \t  ")).toBeNull();
  });

  it("returns null for random text", () => {
    expect(extractSignatureBytes("this is not a signature at all")).toBeNull();
  });

  it("treats input starting with armor header as SSH format, not raw base64", () => {
    // Wrapping raw base64 in armor headers should fail SSH parsing
    const withB64Inside = `-----BEGIN SSH SIGNATURE-----\n${TEST_SIG_BASE64}\n-----END SSH SIGNATURE-----`;
    expect(extractSignatureBytes(withB64Inside)).toBeNull();
  });

  it("does NOT fall through to base64 when SSH parsing fails on SSH-looking input", () => {
    const looksLikeSsh =
      "-----BEGIN SSH SIGNATURE-----\nAAAA\n-----END SSH SIGNATURE-----";
    expect(extractSignatureBytes(looksLikeSsh)).toBeNull();
  });
});
