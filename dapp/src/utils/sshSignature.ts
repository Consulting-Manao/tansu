/**
 * Git identities: a Git host's Ed25519 SSH key signs, with `ssh-keygen -Y
 * sign`, a message binding the member's address, the key and the handle.
 * The contract checks the same bytes (`verify_git_signature`).
 */
import { ed25519 } from "@noble/curves/ed25519.js";

/** The raw 32-byte key of an OpenSSH `ssh-ed25519` public key line. */
export function parseEd25519SshKey(line: string): Uint8Array | null {
  const [type, b64] = line.trim().split(/\s+/);
  if (type !== "ssh-ed25519" || !b64) return null;
  try {
    const blob = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const view = new DataView(blob.buffer);
    const algoLength = view.getUint32(0);
    const algo = new TextDecoder().decode(blob.slice(4, 4 + algoLength));
    const keyLength = view.getUint32(4 + algoLength);
    const key = blob.slice(8 + algoLength, 8 + algoLength + keyLength);
    return algo === "ssh-ed25519" && keyLength === 32 && key.length === 32
      ? key
      : null;
  } catch {
    return null;
  }
}

/**
 * The message a Git key signs: "Stellar Signed Message:\n" || member address
 * || key || identity. The address binds it to one account.
 */
export function buildMessage(
  signingAccount: string,
  gitPubkey: Uint8Array,
  gitId: string,
): Uint8Array {
  const enc = new TextEncoder();
  return concat([
    enc.encode("Stellar Signed Message:\n"),
    enc.encode(signingAccount),
    gitPubkey,
    enc.encode(gitId),
  ]);
}

/** What `ssh-keygen -Y sign -n tansu -O hashalg=sha256` signs for `message`. */
async function sshsigPayload(message: Uint8Array): Promise<Uint8Array> {
  const hash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", message as BufferSource),
  );
  const enc = new TextEncoder();
  const sshString = (data: Uint8Array) => {
    const out = new Uint8Array(4 + data.length);
    new DataView(out.buffer).setUint32(0, data.length);
    out.set(data, 4);
    return out;
  };
  return concat([
    enc.encode("SSHSIG"),
    sshString(enc.encode("tansu")),
    sshString(new Uint8Array(0)),
    sshString(enc.encode("sha256")),
    sshString(hash),
  ]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** Whether `signature` is `gitPubkey`'s over the message for this binding. */
export async function verifyGitSignature(
  signingAccount: string,
  gitPubkey: Uint8Array,
  gitId: string,
  signature: Uint8Array,
): Promise<boolean> {
  const payload = await sshsigPayload(
    buildMessage(signingAccount, gitPubkey, gitId),
  );
  try {
    return ed25519.verify(signature, payload, gitPubkey);
  } catch {
    return false;
  }
}

/** The raw 64-byte signature pasted as base64; `null` when it is not one. */
export function extractSignatureBytes(input: string): Uint8Array | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const bytes = Uint8Array.from(atob(trimmed), (c) => c.charCodeAt(0));
    return bytes.length === 64 ? bytes : null;
  } catch {
    return null;
  }
}

/**
 * The shell command that signs `message` with the private key at `keyPath`
 * and prints the raw signature as base64, with OpenSSH, on Linux and macOS.
 */
export function signingCommand(message: Uint8Array, keyPath: string): string {
  const b64 = btoa(String.fromCharCode(...message));
  const key = keyPath.trim().replace(/^~(?=\/)/, "$HOME");
  return (
    `printf '%s' '${b64}' | base64 -d` +
    ` | ssh-keygen -Y sign -f "${key}" -n tansu -O hashalg=sha256` +
    ` | sed '1d;$d' | base64 -d | tail -c 64 | base64 | tr -d '\\n'`
  );
}
