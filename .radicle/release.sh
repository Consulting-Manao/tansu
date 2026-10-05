#!/usr/bin/env bash
# cargo install radicle-artifact --locked
set -euxo pipefail

REV=090186630bccc0504dfe670a5b920483aed081e1
TAG=v3.0.0

# The location of a file is its IPFS CID, as `ipfs add` computes it. The CIDs
# of the release are BLAKE3 hashes, which `rad-artifact cid` computes.
publish() {
    local name=$1 file=$2 location=$3
    local cid
    cid=$(rad-artifact cid "$file")
    rad-artifact register "$file" --revision $REV --name "$name" --no-input --no-announce
    rad-artifact location add "$location" --revision $REV --cid "$cid" --no-input --no-announce
}

publish wasm-${TAG} ./release/tansu_v3.0.0.wasm ipfs://QmWaGgKkzPPQ5BES3oCjq6EDRVmBfCmwd7RyqYc4xcnjyh
publish attestation-provenance-${TAG} ./release/tansu-attestation_v3.0.0.json ipfs://QmSxq7jcMhhEvQmUHkdGuwCohPhfHwGWR6QRQJiNtpgexX
publish wasm-executor-${TAG} ./release/tansu-executor_v1.0.0.wasm ipfs://QmVshQyzKP2mruKLMcYzFHircZjR8bZGv513pkMxhgLuri
publish attestation-provenance-executor-${TAG} ./release/tansu-executor-attestation_v3.0.0.json ipfs://QmVSYUtcnnWfpXtKR6EAHMRZ9VuBjgJwrt2EFwpcr5p56G

rad sync --announce
rad-artifact show --pretty $REV
