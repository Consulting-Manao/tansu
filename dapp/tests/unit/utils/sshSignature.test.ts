import { describe, it, expect } from "vitest";
import { extractSignatureBytes } from "utils/sshSignature";

const TEST_SIG = new Uint8Array([
  0xd4, 0x82, 0x93, 0xbb, 0x82, 0x92, 0xb2, 0x7e, 0xcd, 0xbe, 0x06, 0xed, 0x47,
  0xdf, 0x0f, 0x42, 0x7c, 0xff, 0x72, 0xfe, 0xc4, 0x48, 0x63, 0xe6, 0x1a, 0x74,
  0xa5, 0x50, 0x33, 0x49, 0x2e, 0xfe, 0xce, 0xf0, 0xa1, 0xb7, 0xe5, 0x72, 0x4e,
  0xf0, 0x82, 0x73, 0x31, 0xbc, 0xa6, 0x64, 0xba, 0xa9, 0x52, 0xc5, 0xf7, 0xe0,
  0x36, 0x87, 0xb6, 0x57, 0x1f, 0x38, 0xa7, 0xad, 0xec, 0x7d, 0x6f, 0x0f,
]);

const TEST_SIG_BASE64 =
  "1IKTu4KSsn7NvgbtR98PQnz/cv7ESGPmGnSlUDNJLv7O8KG35XJO8IJzMbymZLqpUsX34DaHtlcfOKet7H1vDw==";

describe("extractSignatureBytes", () => {
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

  it("returns null for empty string", () => {
    expect(extractSignatureBytes("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(extractSignatureBytes("   \n  \t  ")).toBeNull();
  });

  it("returns null for random text", () => {
    expect(extractSignatureBytes("this is not a signature at all")).toBeNull();
  });
});
