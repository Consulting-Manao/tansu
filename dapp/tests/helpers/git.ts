import { createHash, generateKeyPairSync, sign } from "node:crypto";

function sshString(data: Uint8Array): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  return Buffer.concat([length, data]);
}

/** An Ed25519 SSH key, as a Git host lists it, that signs like ssh-keygen. */
export function sshKey(comment: string) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const raw = publicKey.export({ format: "der", type: "spki" }).subarray(-32);
  const blob = Buffer.concat([
    sshString(Buffer.from("ssh-ed25519")),
    sshString(raw),
  ]);
  return {
    line: `ssh-ed25519 ${blob.toString("base64")} ${comment}`,
    /**
     * The raw base64 signature GitVerification asks for: SSHSIG in the
     * "tansu" namespace over its message for `account` and `identity`.
     */
    sign(account: string, identity: string): string {
      const message = Buffer.concat([
        Buffer.from("Stellar Signed Message:\n"),
        Buffer.from(account),
        raw,
        Buffer.from(identity),
      ]);
      const payload = Buffer.concat([
        Buffer.from("SSHSIG"),
        sshString(Buffer.from("tansu")),
        sshString(Buffer.alloc(0)),
        sshString(Buffer.from("sha256")),
        sshString(createHash("sha256").update(message).digest()),
      ]);
      return sign(null, payload, privateKey).toString("base64");
    },
  };
}
