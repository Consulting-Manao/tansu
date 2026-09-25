import { Buffer } from "buffer";
import { useState, type FC } from "react";
import { fetchGitKeys, type GitKey } from "@service/MemberService";
import Button from "components/utils/Button";
import CopyButton from "components/utils/CopyButton";
import {
  buildMessage,
  extractSignatureBytes,
  parseEd25519SshKey,
  signingCommand,
  verifyGitSignature,
} from "utils/sshSignature";

export interface GitIdentityData {
  gitIdentity: string; // "<provider>:<username>"
  gitPubkey: Buffer; // raw Ed25519 public key (32 bytes)
  gitSig: Buffer; // Ed25519 signature (64 bytes) over the plain message
}

interface Props {
  /** The member's Stellar address, which the signature binds. */
  signingAccount: string;
  /** Called once the signature checks, with what the contract takes. */
  onVerified: (data: GitIdentityData) => void;
  /** Called when the user skips the Git handle linking */
  onSkip: () => void;
}

type Provider = "github" | "gitlab" | "custom";

const inputClass = "w-full rounded border border-zinc-300 px-3 py-2 text-sm";

/** How a key is told apart: its comment, else the end of its key. */
const keyName = ({ line }: GitKey) => {
  const [, b64 = "", ...comment] = line.trim().split(/\s+/);
  return comment.join(" ") || `ssh-ed25519 …${b64.slice(-12)}`;
};

/**
 * Link a Git handle: one of the account's Ed25519 SSH keys signs, with
 * ssh-keygen, a message binding the member's address, the key and the
 * handle. GitHub and GitLab list an account's keys; for another host, the
 * key is pasted.
 */
const GitVerification: FC<Props> = ({ signingAccount, onVerified, onSkip }) => {
  const [step, setStep] = useState<"choice" | "input" | "sign" | "success">(
    "choice",
  );
  const [provider, setProvider] = useState<Provider>("github");
  const [username, setUsername] = useState("");
  const [customProviderName, setCustomProviderName] = useState("");
  const [customPubkeyInput, setCustomPubkeyInput] = useState("");
  const [keys, setKeys] = useState<GitKey[]>([]);
  const [keyIndex, setKeyIndex] = useState(0);
  const [keyPath, setKeyPath] = useState("~/.ssh/id_ed25519");
  const [signatureInput, setSignatureInput] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const gitIdentity = `${provider === "custom" ? customProviderName.trim() : provider}:${username.trim()}`;
  const key = keys[keyIndex];
  const message = key
    ? buildMessage(signingAccount, key.raw, gitIdentity)
    : null;

  const findKeys = async () => {
    setErrorMsg(null);
    try {
      if (!signingAccount) {
        throw new Error("Connect your wallet first: the signature binds it.");
      }
      if (!username.trim()) throw new Error("Please enter a username");
      let found: GitKey[];
      if (provider === "custom") {
        const name = customProviderName.trim();
        if (!name) throw new Error("Please enter a provider name");
        if (name.includes(":")) {
          throw new Error("Provider name cannot contain ':'");
        }
        const line = customPubkeyInput.trim();
        const raw = parseEd25519SshKey(line);
        if (!raw) {
          throw new Error(
            "Invalid Ed25519 SSH public key. It must start with 'ssh-ed25519' followed by the base64-encoded key.",
          );
        }
        found = [{ line, raw }];
      } else {
        setIsBusy(true);
        found = await fetchGitKeys(provider, username.trim());
        if (!found.length) {
          throw new Error(
            "No Ed25519 SSH key found for this account. Make sure you have added an Ed25519 SSH key to your Git provider.",
          );
        }
      }
      setKeys(found);
      setKeyIndex(0);
      setSignatureInput("");
      setStep("sign");
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsBusy(false);
    }
  };

  const verifySignature = async () => {
    if (!key) return;
    setErrorMsg(null);
    const signature = extractSignatureBytes(signatureInput);
    if (!signature) {
      setErrorMsg(
        "Invalid signature. Paste the raw base64-encoded 64-byte signature.",
      );
      return;
    }
    setIsBusy(true);
    const valid = await verifyGitSignature(
      signingAccount,
      key.raw,
      gitIdentity,
      signature,
    );
    setIsBusy(false);
    if (!valid) {
      setErrorMsg(
        "Signature verification failed. Sign with the private key of the key selected above, with the command shown.",
      );
      return;
    }
    setStep("success");
    onVerified({
      gitIdentity,
      gitPubkey: Buffer.from(key.raw),
      gitSig: Buffer.from(signature),
    });
  };

  const error = errorMsg && (
    <p role="alert" className="text-sm text-red-500">
      {errorMsg}
    </p>
  );

  if (step === "choice") {
    return (
      <div className="flex flex-col gap-4 rounded-lg border border-zinc-300 p-4">
        <h3 className="text-base font-semibold text-primary">
          Link Git Identity
        </h3>
        <p className="text-sm text-secondary">
          Optionally link a Git handle to your account, signed with one of its
          SSH keys. This helps prove your identity as a developer.
        </p>
        <div className="flex gap-3">
          <Button onClick={() => setStep("input")}>Link Git Handle</Button>
          <Button type="secondary" onClick={onSkip}>
            Skip
          </Button>
        </div>
      </div>
    );
  }

  if (step === "input") {
    return (
      <div className="flex flex-col gap-4 rounded-lg border border-zinc-300 p-4">
        <h3 className="text-base font-semibold text-primary">
          Link Git Identity
        </h3>

        <div className="flex gap-4" role="radiogroup" aria-label="Git host">
          {(
            [
              ["github", "GitHub"],
              ["gitlab", "GitLab"],
              ["custom", "Custom"],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className="flex items-center gap-2 cursor-pointer"
            >
              <input
                type="radio"
                name="provider"
                checked={provider === value}
                onChange={() => {
                  setProvider(value);
                  setErrorMsg(null);
                }}
                className="accent-primary"
              />
              <span className="text-sm font-medium">{label}</span>
            </label>
          ))}
        </div>

        {provider === "custom" && (
          <input
            type="text"
            aria-label="Provider name"
            placeholder="Provider name (e.g., radicle, bitbucket)"
            value={customProviderName}
            onChange={(e) => setCustomProviderName(e.target.value)}
            className={inputClass}
          />
        )}

        <input
          type="text"
          aria-label="Username"
          placeholder={
            provider === "custom"
              ? "Username / identifier"
              : `${provider === "github" ? "GitHub" : "GitLab"} username`
          }
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && findKeys()}
          className={inputClass}
        />

        {provider === "custom" && (
          <textarea
            aria-label="SSH public key"
            placeholder="Paste your Ed25519 SSH public key (ssh-ed25519 AAAA...)"
            value={customPubkeyInput}
            onChange={(e) => setCustomPubkeyInput(e.target.value)}
            rows={3}
            className={`${inputClass} font-mono`}
          />
        )}

        {error}

        <div className="flex justify-end gap-3">
          <Button type="secondary" onClick={onSkip}>
            Skip
          </Button>
          <Button isLoading={isBusy} disabled={isBusy} onClick={findKeys}>
            {provider === "custom" ? "Next" : "Fetch Keys"}
          </Button>
        </div>
      </div>
    );
  }

  if (step === "sign" && message) {
    const command = signingCommand(message, keyPath);
    return (
      <div className="flex flex-col gap-4 rounded-lg border border-zinc-300 p-4">
        <h3 className="text-base font-semibold text-primary">
          Sign with Git Key
        </h3>
        <p className="text-sm text-secondary">
          You are linking{" "}
          <span className="font-medium text-primary">{gitIdentity}</span>.
        </p>

        {keys.length > 1 && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium text-primary">
              The key you sign with
            </legend>
            {keys.map((listed, index) => (
              <label
                key={listed.line}
                className="flex items-center gap-2 text-sm cursor-pointer"
              >
                <input
                  type="radio"
                  name="git-key"
                  checked={index === keyIndex}
                  onChange={() => {
                    setKeyIndex(index);
                    setSignatureInput("");
                    setErrorMsg(null);
                  }}
                  className="accent-primary"
                />
                <span className="font-mono break-all">{keyName(listed)}</span>
              </label>
            ))}
          </fieldset>
        )}

        <label className="flex flex-col gap-1 text-sm font-medium text-primary">
          Its private key file
          <input
            type="text"
            value={keyPath}
            onChange={(e) => setKeyPath(e.target.value)}
            className={`${inputClass} font-mono font-normal`}
          />
        </label>

        <div className="flex flex-col gap-2">
          <p className="text-sm text-secondary">
            Run this in a terminal (OpenSSH, on Linux or macOS). It prints the
            signature to paste below.
          </p>
          <div className="flex items-start gap-2 rounded bg-zinc-800 p-2">
            <pre
              aria-label="Signing command"
              className="flex-1 overflow-x-auto text-xs text-green-300 font-mono whitespace-pre-wrap break-all select-all"
            >
              {command}
            </pre>
            <CopyButton textToCopy={command} size="sm" />
          </div>
        </div>

        <textarea
          aria-label="Signature"
          placeholder="Paste the raw base64 signature"
          value={signatureInput}
          onChange={(e) => {
            setSignatureInput(e.target.value);
            setErrorMsg(null);
          }}
          rows={3}
          className={`${inputClass} text-xs font-mono`}
        />

        {error}

        <div className="flex justify-end gap-3">
          <Button type="secondary" onClick={() => setStep("input")}>
            Back
          </Button>
          <Button
            isLoading={isBusy}
            onClick={verifySignature}
            disabled={isBusy || !signatureInput.trim()}
          >
            Verify Signature
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-green-200 bg-green-50 p-4">
      <h3 className="text-base font-semibold text-green-800">
        Git key signature checked
      </h3>
      <p className="text-sm text-green-700">
        <span className="font-medium">{gitIdentity}</span> is linked to your
        account when you join.
      </p>
    </div>
  );
};

export default GitVerification;
