#!/usr/bin/env bash
#
# Publish off-chain supply-chain evidence for a Tansu project commit.
#
# Uploads an artifact (SBOM, vulnerability scan, attestation bundle, ...) to
# IPFS and records the resulting content identifier (CID) on-chain by calling
# the contract's `set_evidence`. The contract stores only the CID and a ledger
# timestamp; the artifact itself stays off-chain. An IPFS CIDv1 is already a
# content-addressed multihash, so re-downloading by CID is self-verifying.
#
# IPFS upload is pluggable:
#   * TANSU_IPFS_UPLOAD_COMMAND - any command; the artifact path is appended as
#     the final argument and the CID must be the last token printed on stdout
#     (e.g. "ipfs add --cid-version=1 --quieter").
#   * FILEBASE_TOKEN - fallback that uploads to Filebase's IPFS pinning RPC (the
#     same provider the dApp and SBOM workflow already use).
#
# Signing of the set_evidence transaction is delegated to the `stellar` CLI, so
# the calling environment is expected to have a configured source account.
#
# Usage:
#   tools/evidence/publish.sh \
#     --project-key <hex> --commit-hash <hash> --kind sbom|cve|attestation \
#     --file path/to/artifact [--network testnet] [--contract-id C...] \
#     [--source-account <alias>] [--maintainer G...] [--dry-run]
#
# Network / contract / account / maintainer also read from the environment:
#   TANSU_NETWORK, TANSU_CONTRACT_ID, TANSU_SOURCE_ACCOUNT, TANSU_MAINTAINER.

set -euo pipefail

die() {
  echo "error: $*" >&2
  exit 1
}

usage() {
  sed -n '3,30p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

NETWORK="${TANSU_NETWORK:-testnet}"
CONTRACT_ID="${TANSU_CONTRACT_ID:-}"
SOURCE_ACCOUNT="${TANSU_SOURCE_ACCOUNT:-}"
MAINTAINER="${TANSU_MAINTAINER:-}"
PROJECT_KEY=""
COMMIT_HASH=""
KIND=""
FILE=""
DRY_RUN=0

while [ $# -gt 0 ]; do
  case "$1" in
    --project-key) PROJECT_KEY="$2"; shift 2 ;;
    --commit-hash) COMMIT_HASH="$2"; shift 2 ;;
    --kind) KIND="$2"; shift 2 ;;
    --file) FILE="$2"; shift 2 ;;
    --network) NETWORK="$2"; shift 2 ;;
    --contract-id) CONTRACT_ID="$2"; shift 2 ;;
    --source-account) SOURCE_ACCOUNT="$2"; shift 2 ;;
    --maintainer) MAINTAINER="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage 0 ;;
    *) die "unknown argument: $1" ;;
  esac
done

[ -n "$PROJECT_KEY" ] || die "missing --project-key"
[ -n "$COMMIT_HASH" ] || die "missing --commit-hash"
[ -n "$FILE" ] || die "missing --file"
[ -n "$CONTRACT_ID" ] || die "missing --contract-id (or \$TANSU_CONTRACT_ID)"
[ -n "$SOURCE_ACCOUNT" ] || die "missing --source-account (or \$TANSU_SOURCE_ACCOUNT)"

# Map the CLI-friendly lowercase kind to the contract's EvidenceKind variant.
case "$KIND" in
  sbom) KIND_VARIANT="Sbom" ;;
  cve) KIND_VARIANT="Cve" ;;
  attestation) KIND_VARIANT="Attestation" ;;
  *) die "invalid --kind: '$KIND' (expected sbom|cve|attestation)" ;;
esac

# Validate the artifact and compute an informational digest (not stored on-chain).
if [ -d "$FILE" ]; then
  find "$FILE" -type f | grep -q . || die "directory is empty: $FILE"
  DIGEST="n/a (directory)"
elif [ -f "$FILE" ]; then
  [ -s "$FILE" ] || die "artifact is empty: $FILE"
  DIGEST="sha256:$(sha256sum "$FILE" | cut -d' ' -f1)"
else
  die "artifact not found: $FILE"
fi

# Upload a file or directory to Filebase's IPFS pinning RPC and print the CID.
filebase_upload() {
  local path="$1"
  local url="https://rpc.filebase.io/api/v0/add?cid-version=1"
  local -a curl_args=(
    --silent --show-error --fail
    -X POST -H "Authorization: Bearer ${FILEBASE_TOKEN}"
  )
  if [ -d "$path" ]; then
    # wrap-with-directory preserves the layout; the last response line is the
    # wrapping directory CID.
    url="${url}&wrap-with-directory=true"
    local file rel
    while IFS= read -r file; do
      rel="${file#"$path"/}"
      curl_args+=(-F "file=@${file};filename=${rel}")
    done < <(find "$path" -type f | sort)
  else
    curl_args+=(-F "file=@${path};filename=$(basename "$path")")
  fi
  curl "${curl_args[@]}" "$url" \
    | jq -r '.Hash // .Cid // empty' \
    | tail -n1
}

# Resolve the artifact's CID via the configured upload method.
upload_to_ipfs() {
  local path="$1"
  if [ -n "${TANSU_IPFS_UPLOAD_COMMAND:-}" ]; then
    local out
    out="$(eval "${TANSU_IPFS_UPLOAD_COMMAND} \"\$path\"")"
    # The CID is the last whitespace-separated token printed on stdout.
    printf '%s' "$out" | awk '{w=$NF} END{print w}'
  elif [ -n "${FILEBASE_TOKEN:-}" ]; then
    filebase_upload "$path"
  else
    die "no IPFS upload method configured: set TANSU_IPFS_UPLOAD_COMMAND or FILEBASE_TOKEN"
  fi
}

echo "artifact: $FILE" >&2
echo "digest:   $DIGEST (informational; not stored on-chain)" >&2

CID="$(upload_to_ipfs "$FILE")"
[ -n "$CID" ] || die "could not determine CID from upload"
echo "cid:      $CID" >&2

# Derive the maintainer address from the source account when not provided.
if [ -z "$MAINTAINER" ]; then
  MAINTAINER="$(stellar keys address "$SOURCE_ACCOUNT")"
fi

set_evidence_cmd=(
  stellar contract invoke
  --source-account "$SOURCE_ACCOUNT"
  --network "$NETWORK"
  --id "$CONTRACT_ID"
  --
  set_evidence
  --maintainer "$MAINTAINER"
  --project_key "$PROJECT_KEY"
  --commit_hash "$COMMIT_HASH"
  --kind "$KIND_VARIANT"
  --cid "$CID"
)

if [ "$DRY_RUN" -eq 1 ]; then
  echo "[dry-run] ${set_evidence_cmd[*]}" >&2
else
  "${set_evidence_cmd[@]}"
fi

# Machine-readable summary on stdout (stderr carries the human log above).
printf '{"project_key":"%s","commit_hash":"%s","kind":"%s","cid":"%s","digest":"%s","dry_run":%s}\n' \
  "$PROJECT_KEY" "$COMMIT_HASH" "$KIND" "$CID" "$DIGEST" \
  "$([ "$DRY_RUN" -eq 1 ] && echo true || echo false)"
