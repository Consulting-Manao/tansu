import { describe, it, expect, beforeAll } from "vitest";
import {
  generateRSAKeyPair,
  encryptWithPublicKey,
  decryptWithPrivateKey,
} from "../../../src/utils/crypto";

// Generate ONE key pair before the suite and share across tests to avoid
// repeated 2048-bit RSA key generation (typically 1–5s per call).
let sharedPublicKey = "";
let sharedPrivateKey = "";
let otherPublicKey = "";
let otherPrivateKey = "";

beforeAll(async () => {
  const [pair1, pair2] = await Promise.all([
    generateRSAKeyPair(),
    generateRSAKeyPair(),
  ]);
  sharedPublicKey = pair1.publicKey;
  sharedPrivateKey = pair1.privateKey;
  otherPublicKey = pair2.publicKey;
  otherPrivateKey = pair2.privateKey;
}, 30_000);

describe("RSA key generation", () => {
  it("generates a key pair with base-64-encoded keys", () => {
    expect(sharedPublicKey.length).toBeGreaterThan(100);
    expect(sharedPrivateKey.length).toBeGreaterThan(100);
  });

  it("generates different key pairs each time", () => {
    expect(sharedPublicKey).not.toBe(otherPublicKey);
    expect(sharedPrivateKey).not.toBe(otherPrivateKey);
  });
});

describe("RSA encrypt/decrypt round-trip", () => {
  it("encrypts and decrypts a short message", async () => {
    const ciphertext = await encryptWithPublicKey(
      "hello world",
      sharedPublicKey,
    );
    expect(ciphertext).toBeTruthy();
    const plaintext = await decryptWithPrivateKey(ciphertext, sharedPrivateKey);
    expect(plaintext).toBe("hello world");
  });

  it("handles messages with special characters", async () => {
    const message = "a:1:b:2:c:3";
    const ciphertext = await encryptWithPublicKey(message, sharedPublicKey);
    const plaintext = await decryptWithPrivateKey(ciphertext, sharedPrivateKey);
    expect(plaintext).toBe(message);
  });

  it("handles numeric strings", async () => {
    const message = "12345";
    const ciphertext = await encryptWithPublicKey(message, sharedPublicKey);
    const plaintext = await decryptWithPrivateKey(ciphertext, sharedPrivateKey);
    expect(plaintext).toBe(message);
  });

  it("handles empty string", async () => {
    const ciphertext = await encryptWithPublicKey("", sharedPublicKey);
    const plaintext = await decryptWithPrivateKey(ciphertext, sharedPrivateKey);
    expect(plaintext).toBe("");
  });

  it("fails to decrypt with a different private key", async () => {
    const ciphertext = await encryptWithPublicKey("secret", sharedPublicKey);
    await expect(
      decryptWithPrivateKey(ciphertext, otherPrivateKey),
    ).rejects.toThrow();
  });
});

describe("key sanitization", () => {
  it("handles base64 keys with whitespace", async () => {
    const dirtyPublicKey = `  ${sharedPublicKey.slice(0, 20)} \n ${sharedPublicKey.slice(20)} `;
    const dirtyPrivateKey = `\t${sharedPrivateKey.slice(0, 30)}\n${sharedPrivateKey.slice(30)} `;

    const ciphertext = await encryptWithPublicKey("test", dirtyPublicKey);
    const plaintext = await decryptWithPrivateKey(ciphertext, dirtyPrivateKey);
    expect(plaintext).toBe("test");
  });
});
