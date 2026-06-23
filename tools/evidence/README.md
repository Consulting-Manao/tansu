# Evidence publishing tool

`publish_evidence.py` is the producer side of the Tansu commit-evidence feature. It
takes an off-chain artifact (SBOM, vulnerability scan, attestation manifest, ...),
uploads it to IPFS, and records the resulting CID on-chain via the contract's
`set_evidence`.

The contract stores only the CID and a ledger timestamp — the artifact stays
off-chain. An IPFS CIDv1 is a content-addressed multihash, so fetching by CID is
self-verifying; the tool prints a `sha256` for human-readable logs but does **not**
send it on-chain.

## Usage

```bash
uv run tools/evidence/publish_evidence.py \
  --project-key <hex> \
  --commit-hash <hash> \
  --kind sbom|cve|attestation \
  --file path/to/artifact.json \
  --network testnet \
  --contract-id C... \
  --source-account <stellar key alias or secret>
```

Network / contract / account / maintainer can also come from the environment:
`TANSU_NETWORK`, `TANSU_CONTRACT_ID`, `TANSU_SOURCE_ACCOUNT`, `TANSU_MAINTAINER`.

### IPFS upload (pluggable)

- `TANSU_IPFS_UPLOAD_COMMAND` — any command; the artifact path is appended as the
  last argument and the CID must be the last token printed on stdout
  (e.g. `ipfs add --cid-version=1 --quieter`).
- `FILEBASE_TOKEN` — fallback that uploads to Filebase's IPFS pinning RPC.

Use `--dry-run` to upload but print the `set_evidence` command instead of running it.

## Tests

```bash
uv run --with pytest pytest tools/evidence/test_publish_evidence.py
```

The tests stub every shell-out (`publish_evidence._run`), so they need no network,
IPFS endpoint, or Stellar account.

See `website/docs/developers/evidence.mdx` for the full feature documentation and the
`.github/workflows/evidence.yml` CI workflow.
