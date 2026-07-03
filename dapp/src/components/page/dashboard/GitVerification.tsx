import { useState, type FC, useCallback } from "react";
import { ed25519 } from "@noble/curves/ed25519.js";
import { extractSignatureBytes } from "utils/sshSignature";
import Button from "components/utils/Button";

export interface GitIdentityData {
  gitIdentity: string; // "<provider>:<username>"
  gitPubkey: Buffer; // raw Ed25519 public key (32 bytes)
  gitSig: Buffer; // Ed25519 signature (64 bytes) over the plain message
}

interface Props {
  /** The member's Stellar address */
  signingAccount: string;
  /** Called when verification succeeds with the assembled git data */
  onVerified: (data: GitIdentityData) => void;
  /** Called when the user skips the Git handle linking */
  onSkip: () => void;
}

/** Parse an OpenSSH ed25519 public key line and return the raw 32‑byte key. */
function parseEd25519SshKey(line: string): Uint8Array | null {
  const parts = line.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const keyType = parts[0];
  const b64 = parts[1];
  if (!b64 || keyType !== "ssh-ed25519") return null;

  try {
    const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    let offset = 0;
    const readLen = (): number => {
      const len =
        (raw[offset]! << 24) |
        (raw[offset + 1]! << 16) |
        (raw[offset + 2]! << 8) |
        raw[offset + 3]!;
      offset += 4;
      return len;
    };
    const algoLen = readLen();
    const algo = String.fromCharCode(...raw.slice(offset, offset + algoLen));
    offset += algoLen;
    if (algo !== "ssh-ed25519") return null;
    const keyLen = readLen();
    if (keyLen !== 32) return null;
    return raw.slice(offset, offset + 32);
  } catch {
    return null;
  }
}

/**
 * Build the message that gets signed.
 *
 * Format: "Stellar Signed Message:\n" || member_address || git_pubkey || git_identity
 *
 * This matches what the contract reconstructs and verifies. The member_address
 * is embedded to prevent replay attacks — a signature created for one Stellar
 * account cannot be reused to bind the same git identity to a different account.
 *
 * This is exported as a pure function so it can be unit-tested independently
 * of the component UI.
 */
export function buildMessage(
  signingAccount: string,
  gitPubkey: Uint8Array,
  gitId: string,
): Uint8Array {
  const enc = new TextEncoder();
  const prefix = enc.encode("Stellar Signed Message:\n");
  const address = enc.encode(signingAccount);
  const identity = enc.encode(gitId);

  const total =
    prefix.length + address.length + gitPubkey.length + identity.length;
  const msg = new Uint8Array(total);
  msg.set(prefix, 0);
  msg.set(address, prefix.length);
  msg.set(gitPubkey, prefix.length + address.length);
  msg.set(identity, prefix.length + address.length + gitPubkey.length);
  return msg;
}

/** Build the SSHSIG tosign payload that the contract verifies:
 *  "SSHSIG" + string("tansu") + string("") + string("sha256") + string(SHA-256(message))
 *  (mirrors `verify_git_signature` in contract_membership.rs) */
export async function buildSshsigPayload(
  msgBytes: Uint8Array,
): Promise<Uint8Array> {
  const hash = await crypto.subtle.digest("SHA-256", msgBytes as BufferSource);
  const hashBytes = new Uint8Array(hash);

  const sshString = (data: Uint8Array): Uint8Array => {
    const len = new Uint8Array(4);
    new DataView(len.buffer).setUint32(0, data.length);
    const out = new Uint8Array(4 + data.length);
    out.set(len, 0);
    out.set(data, 4);
    return out;
  };

  const enc = new TextEncoder();
  const parts = [
    enc.encode("SSHSIG"),
    sshString(enc.encode("tansu")),
    sshString(new Uint8Array(0)), // reserved
    sshString(enc.encode("sha256")),
    sshString(hashBytes),
  ];

  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

const GitVerification: FC<Props> = ({ signingAccount, onVerified, onSkip }) => {
  const [step, setStep] = useState<
    | "choice"
    | "input"
    | "fetching"
    | "verify"
    | "signing"
    | "checking"
    | "success"
    | "error"
  >("choice");
  const [provider, setProvider] = useState<"github" | "gitlab" | "custom">(
    "github",
  );
  const [username, setUsername] = useState("");
  const [customProviderName, setCustomProviderName] = useState("");
  const [customPubkeyInput, setCustomPubkeyInput] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fetchedPubkeys, setFetchedPubkeys] = useState<Uint8Array[]>([]);
  const [gitIdentity, setGitIdentity] = useState<string>("");
  const [messageForSigning, setMessageForSigning] = useState<string>("");
  const [signatureInput, setSignatureInput] = useState("");
  const [, setGitIdentityData] = useState<GitIdentityData | null>(null);

  const svgCheck =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg>';

  const handleProviderChange = (p: "github" | "gitlab" | "custom") => {
    setProvider(p);
    setErrorMsg(null);
    setFetchedPubkeys([]);
    if (p !== "custom") {
      setCustomProviderName("");
      setCustomPubkeyInput("");
    }
  };

  const handleFetchKeys = useCallback(async () => {
    if (!username.trim()) {
      setErrorMsg("Please enter a username");
      return;
    }

    // ── Custom provider path: parse pasted key, no URL fetch ────────────
    if (provider === "custom") {
      if (!customProviderName.trim()) {
        setErrorMsg("Please enter a provider name");
        return;
      }
      if (customProviderName.includes(":")) {
        setErrorMsg("Provider name cannot contain ':'");
        return;
      }
      if (!customPubkeyInput.trim()) {
        setErrorMsg("Please paste your Ed25519 SSH public key");
        return;
      }

      const rawKey = parseEd25519SshKey(customPubkeyInput);
      if (!rawKey) {
        setErrorMsg(
          "Invalid Ed25519 SSH public key. It must start with 'ssh-ed25519' followed by the base64-encoded key.",
        );
        return;
      }

      setFetchedPubkeys([rawKey]);
      const identity = `${customProviderName.trim()}:${username.trim()}`;
      setGitIdentity(identity);

      const msgBytes = buildMessage(signingAccount, rawKey, identity);
      const msgHex = Array.from(msgBytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      setMessageForSigning(msgHex);
      setStep("verify");
      return;
    }

    // ── GitHub / GitLab path: fetch keys from the provider ──────────────
    setStep("fetching");
    setErrorMsg(null);

    try {
      let url: string;
      if (provider === "github") {
        url = `https://github.com/${encodeURIComponent(username.trim())}.keys`;
      } else {
        url = `https://gitlab.com/api/v4/users/${encodeURIComponent(username.trim())}/keys`;
      }

      // Attempt direct fetch first; fall back to CORS proxy if it fails
      let response: Response;
      try {
        response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
      } catch {
        // CORS proxy fallback
        const proxyUrl = `http://localhost:8080/${url}`;
        response = await fetch(proxyUrl, {
          signal: AbortSignal.timeout(12_000),
        });
      }

      if (!response.ok) {
        throw new Error(
          `Failed to fetch keys (HTTP ${response.status}). Make sure the username exists.`,
        );
      }

      let keysText: string;
      if (provider === "gitlab") {
        // GitLab returns JSON: [{ id, key: "ssh-ed25519 AAAA...", ... }]
        const json: Array<{ key: string }> = await response.json();
        keysText = json.map((k) => k.key).join("\n");
      } else {
        keysText = await response.text();
      }

      const lines = keysText.split("\n");
      const rawKeys: Uint8Array[] = [];
      for (const line of lines) {
        const rawKey = parseEd25519SshKey(line);
        if (rawKey) rawKeys.push(rawKey);
      }

      if (rawKeys.length === 0) {
        throw new Error(
          "No Ed25519 SSH key found for this account. Make sure you have added an Ed25519 SSH key to your Git provider.",
        );
      }

      setFetchedPubkeys(rawKeys);
      const identity = `${provider}:${username.trim()}`;
      setGitIdentity(identity);

      // Build the message for signing using the first fetched key
      const msgBytes = buildMessage(signingAccount, rawKeys[0]!, identity);
      const msgHex = Array.from(msgBytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      setMessageForSigning(msgHex);
      setStep("verify");
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to fetch public keys");
      setStep("input");
    }
  }, [
    username,
    provider,
    signingAccount,
    customProviderName,
    customPubkeyInput,
  ]);

  const verifySignature = useCallback(async () => {
    if (fetchedPubkeys.length === 0 || !signatureInput.trim()) return;
    setStep("checking");
    setErrorMsg(null);

    try {
      // Extract signature bytes
      const sigBytes: Uint8Array | null = extractSignatureBytes(signatureInput);

      if (!sigBytes || sigBytes.length !== 64) {
        throw new Error(
          "Invalid signature. Paste the raw base64-encoded 64-byte signature.",
        );
      }

      // Try each fetched pubkey until one verifies
      let matchingPubkey: Uint8Array | null = null;
      for (const pubkey of fetchedPubkeys) {
        // Rebuild the message for this specific pubkey
        const msgBytes = buildMessage(signingAccount, pubkey, gitIdentity);

        // Build the SSHSIG tosign payload (same format as contract)
        const tosign = await buildSshsigPayload(msgBytes);

        // Verify Ed25519 signature against the SSHSIG payload
        const valid = ed25519.verify(sigBytes, tosign, pubkey);
        if (valid) {
          matchingPubkey = pubkey;
          break;
        }
      }

      if (!matchingPubkey) {
        throw new Error(
          "Signature verification failed. The signature does not match the message and any of the fetched public keys. " +
            "Make sure you used the correct private key that matches an SSH key on your Git provider.",
        );
      }

      const data: GitIdentityData = {
        gitIdentity,
        gitPubkey: Buffer.from(matchingPubkey),
        gitSig: Buffer.from(sigBytes),
      };
      setGitIdentityData(data);
      setStep("success");
      onVerified(data);
    } catch (err: any) {
      setErrorMsg(err?.message || "Signature verification failed");
      setStep("verify");
    }
  }, [fetchedPubkeys, signatureInput, gitIdentity, signingAccount, onVerified]);

  const handleSkip = () => {
    onSkip();
  };

  // ── Step: choice ────────────────────────────────────────────────
  if (step === "choice") {
    return (
      <div className="flex flex-col gap-4 rounded-lg border border-zinc-300 p-4">
        <h3 className="text-base font-semibold text-primary">
          Link Git Identity
        </h3>
        <p className="text-sm text-secondary">
          Optionally link a Git handle (GitHub/GitLab) to your account. This
          helps prove your identity as a developer.
        </p>
        <div className="flex gap-3">
          <Button onClick={() => setStep("input")}>Link Git Handle</Button>
          <Button type="secondary" onClick={handleSkip}>
            Skip
          </Button>
        </div>
      </div>
    );
  }

  // ── Step: input / fetching ──────────────────────────────────────
  if (step === "input" || step === "fetching") {
    return (
      <div className="flex flex-col gap-4 rounded-lg border border-zinc-300 p-4">
        <h3 className="text-base font-semibold text-primary">
          Link Git Identity
        </h3>

        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="provider"
              checked={provider === "github"}
              onChange={() => handleProviderChange("github")}
              className="accent-primary"
            />
            <span className="text-sm font-medium">GitHub</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="provider"
              checked={provider === "gitlab"}
              onChange={() => handleProviderChange("gitlab")}
              className="accent-primary"
            />
            <span className="text-sm font-medium">GitLab</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="provider"
              checked={provider === "custom"}
              onChange={() => handleProviderChange("custom")}
              className="accent-primary"
            />
            <span className="text-sm font-medium">Custom</span>
          </label>
        </div>

        {provider === "custom" && (
          <input
            type="text"
            placeholder="Provider name (e.g., radicle, bitbucket)"
            value={customProviderName}
            onChange={(e) => {
              setCustomProviderName(e.target.value);
              setErrorMsg(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleFetchKeys();
            }}
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
            disabled={step === "fetching"}
          />
        )}

        <input
          type="text"
          placeholder={
            provider === "custom"
              ? "Username / identifier"
              : `${provider === "github" ? "GitHub" : "GitLab"} username`
          }
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            setErrorMsg(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleFetchKeys();
          }}
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
          disabled={step === "fetching"}
        />

        {provider === "custom" && (
          <textarea
            placeholder="Paste your Ed25519 SSH public key (ssh-ed25519 AAAA...)"
            value={customPubkeyInput}
            onChange={(e) => {
              setCustomPubkeyInput(e.target.value);
              setErrorMsg(null);
            }}
            rows={3}
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm font-mono"
            disabled={step === "fetching"}
          />
        )}

        {errorMsg && (
          <p className="text-sm text-red-500" data-testid="git-error">
            {errorMsg}
          </p>
        )}

        <div className="flex justify-end gap-3">
          <Button type="secondary" onClick={handleSkip}>
            Skip
          </Button>
          <Button isLoading={step === "fetching"} onClick={handleFetchKeys}>
            {provider === "custom" ? "Next" : "Fetch Keys"}
          </Button>
        </div>
      </div>
    );
  }

  // ── Step: verify / signing / checking ────────────────────────────
  if (step === "verify" || step === "checking") {
    return (
      <div className="flex flex-col gap-4 rounded-lg border border-zinc-300 p-4">
        <h3 className="text-base font-semibold text-primary">
          Sign with Git Key
        </h3>
        <p className="text-sm text-secondary">
          You are linking{" "}
          <span className="font-medium text-primary">{gitIdentity}</span>.
        </p>

        {/* Message preview */}
        <div className="rounded bg-zinc-50 p-3">
          <p className="mb-1 text-xs font-medium text-secondary">
            Message to sign (hex):
          </p>
          <pre className="overflow-x-auto text-xs text-primary whitespace-pre-wrap break-all font-mono">
            {messageForSigning}
          </pre>
        </div>

        {/* Signing instructions */}
        <div className="flex flex-col gap-3">
          <div className="rounded border border-zinc-200 p-3">
            <p className="mb-2 text-xs font-medium text-secondary">
              Recommended — Using ssh-keygen:
            </p>
            <div className="relative">
              <pre className="overflow-x-auto rounded bg-zinc-800 p-2 pr-8 text-xs text-green-300 font-mono select-all">
                {`# Save the message as binary from hex
printf '${messageForSigning}' | xxd -r -p > /tmp/git-identity-msg

# Sign with your Ed25519 SSH key using OpenSSH and extract the raw 64-byte sig
ssh-keygen -Y sign -f ~/.ssh/id_ed25519 -n tansu -O hashalg=sha256 /tmp/git-identity-msg \\
  | tail -n +2 | head -n -1 | base64 -d \\
  | tail -c 64 | base64 | pbcopy

# The raw base64 signature is now in your clipboard — paste it below`}
              </pre>
              <button
                onClick={() => {
                  const cmd = `printf '${messageForSigning}' | xxd -r -p > /tmp/git-identity-msg && ssh-keygen -Y sign -f ~/.ssh/id_ed25519 -n tansu -O hashalg=sha256 /tmp/git-identity-msg | tail -n +2 | head -n -1 | base64 -d | tail -c 64 | base64 | pbcopy`;
                  navigator.clipboard.writeText(cmd);
                  const btn = document.getElementById("sshkg-copy-btn");
                  if (btn) {
                    const original = btn.innerHTML;
                    btn.innerHTML = svgCheck;
                    setTimeout(() => (btn.innerHTML = original), 2000);
                  }
                }}
                id="sshkg-copy-btn"
                className="absolute top-1 right-1 p-1 rounded hover:bg-zinc-700"
                aria-label="Copy signing command"
                title="Copy signing command"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              </button>
            </div>
          </div>

          <div className="rounded border border-zinc-200 p-3">
            <p className="mb-2 text-xs font-medium text-secondary">
              Alternative — Using Python + cryptography:
            </p>
            <div className="relative">
              <pre className="overflow-x-auto rounded bg-zinc-800 p-2 pr-8 text-xs text-green-300 font-mono select-all">
                {`# 1. Save the message as binary from hex
printf '${messageForSigning}' | xxd -r -p > /tmp/git-identity-msg

# 2. Sign with your Ed25519 SSH key (requires Python + cryptography)
#    Note: builds the SSHSIG payload (matching ssh-keygen -Y sign -O hashalg=sha256 -n tansu)
python3 -c "
import hashlib, struct, base64
from cryptography.hazmat.primitives.serialization import load_ssh_private_key

with open('$HOME/.ssh/id_ed25519', 'rb') as f:
    key = load_ssh_private_key(f.read(), None)

with open('/tmp/git-identity-msg', 'rb') as f:
    msg = f.read()

# SHA-256 of the raw message
digest = hashlib.sha256(msg).digest()

# Build SSHSIG payload:
# 'SSHSIG' + string('tansu') + string('') + string('sha256') + string(SHA-256(msg))
def ssh_string(d):
    return struct.pack('>I', len(d)) + d

tosign = b'SSHSIG'
tosign += ssh_string(b'tansu')
tosign += ssh_string(b'')        # reserved
tosign += ssh_string(b'sha256')
tosign += ssh_string(digest)

sig = key.sign(tosign)
print(base64.b64encode(sig).decode())
" | pbcopy`}
              </pre>
              <button
                onClick={() => {
                  const cmd = `printf '${messageForSigning}' | xxd -r -p > /tmp/git-identity-msg && python3 -c "
import hashlib, struct, base64
from cryptography.hazmat.primitives.serialization import load_ssh_private_key

with open('$HOME/.ssh/id_ed25519', 'rb') as f:
    key = load_ssh_private_key(f.read(), None)

with open('/tmp/git-identity-msg', 'rb') as f:
    msg = f.read()

# SHA-256 of the raw message
digest = hashlib.sha256(msg).digest()

# Build SSHSIG payload:
# 'SSHSIG' + string('tansu') + string('') + string('sha256') + string(SHA-256(msg))
def ssh_string(d):
    return struct.pack('>I', len(d)) + d

tosign = b'SSHSIG'
tosign += ssh_string(b'tansu')
tosign += ssh_string(b'')        # reserved
tosign += ssh_string(b'sha256')
tosign += ssh_string(digest)

sig = key.sign(tosign)
print(base64.b64encode(sig).decode())
" | pbcopy`;
                  navigator.clipboard.writeText(cmd);
                  const btn = document.getElementById("ssh-copy-btn");
                  if (btn) {
                    const original = btn.innerHTML;
                    btn.innerHTML = svgCheck;
                    setTimeout(() => (btn.innerHTML = original), 2000);
                  }
                }}
                id="ssh-copy-btn"
                className="absolute top-1 right-1 p-1 rounded hover:bg-zinc-700"
                aria-label="Copy signing command"
                title="Copy signing command"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              </button>
            </div>
          </div>

          <div className="rounded border border-zinc-200 p-3">
            <p className="mb-2 text-xs font-medium text-secondary">
              Alternative — Using Node.js (if you have the key seed):
            </p>
            <div className="relative">
              <pre className="overflow-x-auto rounded bg-zinc-800 p-2 pr-8 text-xs text-green-300 font-mono select-all">
                {`# Install dependencies (if not already installed)
npm install @noble/curves

# Sign
# Note: builds the SSHSIG payload (matching ssh-keygen -Y sign -O hashalg=sha256 -n tansu)
node -e "
const { ed25519 } = require('@noble/curves/ed25519');
const { createHash } = require('crypto');

const msg = Buffer.from('${messageForSigning}', 'hex');
const hash = createHash('sha256').update(msg).digest();

// Build SSHSIG payload:
// 'SSHSIG' + string('tansu') + string('') + string('sha256') + string(SHA-256(msg))
const sshString = (d) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(d.length);
  return Buffer.concat([len, d]);
};
const tosign = Buffer.concat([
  Buffer.from('SSHSIG'),
  sshString(Buffer.from('tansu')),
  sshString(Buffer.alloc(0)),        // reserved
  sshString(Buffer.from('sha256')),
  sshString(hash),
]);

const seed = new Uint8Array(32); // ← replace with your 32-byte key seed
const sig = ed25519.sign(tosign, seed);
console.log(Buffer.from(sig).toString('base64'));
"`}
              </pre>
              <button
                onClick={() => {
                  const cmd = `npm install @noble/curves
node -e "
const { ed25519 } = require('@noble/curves/ed25519');
const { createHash } = require('crypto');

const msg = Buffer.from('${messageForSigning}', 'hex');
const hash = createHash('sha256').update(msg).digest();

// Build SSHSIG payload:
// 'SSHSIG' + string('tansu') + string('') + string('sha256') + string(SHA-256(msg))
const sshString = (d) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(d.length);
  return Buffer.concat([len, d]);
};
const tosign = Buffer.concat([
  Buffer.from('SSHSIG'),
  sshString(Buffer.from('tansu')),
  sshString(Buffer.alloc(0)),        // reserved
  sshString(Buffer.from('sha256')),
  sshString(hash),
]);

const seed = new Uint8Array(32); // ← replace with your 32-byte key seed
const sig = ed25519.sign(tosign, seed);
console.log(Buffer.from(sig).toString('base64'));
"`;
                  navigator.clipboard.writeText(cmd);
                  const btn = document.getElementById("node-copy-btn");
                  if (btn) {
                    const original = btn.innerHTML;
                    btn.innerHTML = svgCheck;
                    setTimeout(() => (btn.innerHTML = original), 2000);
                  }
                }}
                id="node-copy-btn"
                className="absolute top-1 right-1 p-1 rounded hover:bg-zinc-700"
                aria-label="Copy signing command"
                title="Copy signing command"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <p className="text-xs text-secondary">
          Sign the raw message above with your Ed25519 private key using one of
          the methods shown, then paste the raw base64-encoded 64-byte signature
          below.
        </p>

        <textarea
          placeholder={`Paste the raw base64 signature`}
          value={signatureInput}
          onChange={(e) => {
            setSignatureInput(e.target.value);
            setErrorMsg(null);
          }}
          rows={4}
          className="w-full rounded border border-zinc-300 px-3 py-2 text-xs font-mono"
          disabled={step === "checking"}
        />

        {errorMsg && (
          <p className="text-sm text-red-500" data-testid="sig-error">
            {errorMsg}
          </p>
        )}

        <div className="flex justify-end gap-3">
          <Button type="secondary" onClick={handleSkip}>
            Skip
          </Button>
          <Button
            isLoading={step === "checking"}
            onClick={verifySignature}
            disabled={!signatureInput.trim()}
          >
            Verify Signature
          </Button>
        </div>
      </div>
    );
  }

  // ── Step: success ───────────────────────────────────────────────
  if (step === "success") {
    return (
      <div className="flex flex-col gap-4 rounded-lg border border-green-200 bg-green-50 p-4">
        <div className="flex items-center gap-2">
          <svg
            className="h-5 w-5 text-green-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
          <h3 className="text-base font-semibold text-green-800">
            Git Identity Verified
          </h3>
        </div>
        <p className="text-sm text-green-700">
          Successfully linked <span className="font-medium">{gitIdentity}</span>{" "}
          to your account.
        </p>
      </div>
    );
  }

  return null;
};

export default GitVerification;
