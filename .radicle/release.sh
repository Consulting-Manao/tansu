#!/usr/bin/env bash
# Publish the release artifacts on Radicle: each file is uploaded to Filebase's
# IPFS pinning RPC, registered in the release of REV, and its IPFS location is
# recorded. Registering again is harmless.
#
#   cargo install radicle-artifact --locked
#   FILEBASE_TOKEN=... bash .radicle/release.sh
#
# `make contract_release` declares the same release on the Tansu contract.
set -euo pipefail

REV=090186630bccc0504dfe670a5b920483aed081e1
TAG=v3.0.0

publish() {
    local name=$1 file=$2
    local cid ipfs
    cid=$(rad-artifact cid "$file")
    ipfs=$(curl --silent --show-error --fail -X POST \
        -H "Authorization: Bearer ${FILEBASE_TOKEN}" \
        -F "file=@${file};filename=$(basename "$file")" \
        "https://rpc.filebase.io/api/v0/add?cid-version=1" | jq -r '.Hash' | tail -n1)
    rad-artifact register "$file" --revision $REV --name "$name" --no-input --no-announce
    rad-artifact location add "ipfs://$ipfs" --revision $REV --cid "$cid" --no-input --no-announce
}

publish wasm-${TAG} ./release/tansu_v3.0.0.wasm
publish attestation-provenance-${TAG} ./release/tansu-attestation_v3.0.0.json
publish wasm-executor-${TAG} ./release/tansu-executor_v1.0.0.wasm
publish attestation-provenance-executor-${TAG} ./release/tansu-executor-attestation_v3.0.0.json

rad sync --announce
rad-artifact show --pretty $REV
