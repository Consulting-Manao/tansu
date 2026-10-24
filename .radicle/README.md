# Radicle CI/CD

Install: `cargo install radicle-artifact radicle-job --locked`.

## CI ([`ci.sh`](ci.sh))

Runs from the repo root via **`make radicle_ci`** or **`.radicle/ci.sh`**.

1. **`git fetch rad`** and **`refs/heads/rad-ci`** when present.
2. **Orphan worktree** (`radicle-ci-<pid>`) so you can keep a local **`rad-ci`** checkout elsewhere.
3. **Restore** prior logs from **`rad/rad-ci`** into **`.radicle/ci/`** when that tree exists on the remote branch; otherwise first-run message only.
4. **`rad-job new`** / **`run`** (Explorer log URL), then **`cargo test`** (same as **`make contract_test`**) with output in **`.radicle/ci/<YYYY-MM-DD>_<full-sha>.log`**.
5. **`rad-job succeeded`** or **`failed`** for the run UUID, then **commit** all of **`.radicle/ci`** and **`git push --force rad HEAD:refs/heads/rad-ci`**.

Remote **`rad`**, branch **`rad-ci`**.

**Explorer log URL:**  
`https://radicle.network/nodes/<host>/<rid>/remotes/<nid>/tree/rad-ci/.radicle/ci/<YYYY-MM-DD>_<sha>.log`  
- **`<host>`:** **`RADICLE_LOG_NODE`** (default **`iris.radicle.xyz`**)  
- **`<nid>`:** last path segment of **`remote.rad.pushurl`** (`rad://<rid>/<nid>`)

The script **exits with the `cargo test` exit code**.

Logs on **`rad-ci`** are pruned automatically after 90 days by parsing the **`<YYYY-MM-DD>`** date prefix in each filename. Old job COBs are **not** pruned (`rad-job` has no delete subcommand).

## CD ([`release.sh`](release.sh))

Run on Linux with Bash, Git, Docker, jq and GNU `sha256sum`; publication also
needs curl, a running authenticated Radicle node, `radicle-artifact` and
`radicle-job`. Build both contracts from a tag already pushed to `rad`:

```bash
TAG=v3.0.1
# Choose a trusted Stellar CLI image: explicit registry, single-architecture digest.
IMAGE=docker.io/stellar/stellar-cli@sha256:<approved-digest>
git push rad "refs/tags/$TAG"
make radicle_release tag="$TAG" image="$IMAGE"
make radicle_release_verify tag="$TAG"
```

The build uses `git archive` of the tagged commit, not the working tree. The
image must implement the SEP-58 Stellar entrypoint and `/source` working
directory. Its bundled Rust toolchain is selected explicitly, without updating
it. Both optimized WASMs embed `source_repo`, `home_domain`, `bldimg`, `bldopt`
and `source_sha256`. The exact source archive, build log, in-toto/SLSA provenance,
WASMs and `SHA256SUMS` are written to `release/<tag>/`. Existing output is never
overwritten; a failed build leaves its log for inspection.

`radicle_release_verify` checks the bundle's checksums, provenance commit and
source archive against the local tag. These checks are not an independent
rebuild or proof of authenticity. Review the provenance and reproduce the WASMs
in a separate worktree with the same approved image before publishing:

```bash
original=$PWD
git worktree add --detach ../tansu-release-check HEAD
(cd ../tansu-release-check && make radicle_release tag="$TAG" image="$IMAGE")
(cd "../tansu-release-check/release/$TAG" &&
    grep '\.wasm$' "$original/release/$TAG/SHA256SUMS" | sha256sum --check -)
```

With `FILEBASE_TOKEN` exported, publish the reviewed bundle:

```bash
make radicle_release_publish tag="$TAG"
```

This uploads each file to Filebase IPFS, registers its signed Radicle artifact
and IPFS location, and records the publication status with `rad-job`. An upload
or registration failure stops publication and marks a started job as failed;
a retry reuses the author's release for that commit. The release is selected by
commit because pushed tags can exist only in a delegate's namespace. Radicle
registrations and job results are signed locally before `rad sync --announce`
replicates them; if synchronization fails, retry that command after reconnecting.
Failed jobs remain local until synchronized or the next publication attempt.
Radicle artifact CIDs and Filebase IPFS CIDs use different content addressing; the
location links them. Have another delegate verify the downloaded files using
`rad-artifact verify` and attest their CIDs with `rad-artifact attest`.

The [SEP-55](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0055.md)
discovery fields and statement subjects are retained, but its GitHub attestation
API does not discover Radicle signatures. This workflow uses signed Radicle
release records instead of GitHub OIDC attestations; it does not claim complete
GitHub verifier compatibility or an isolated SLSA build level.
[SEP-58](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0058.md)
rebuild inputs are embedded in the WASMs and recorded in the provenance.

GitHub contract release automation is removed. Stellar Registry publication,
`make contract_release tag="$TAG"` (on-chain evidence), and contract upgrades
remain separate maintainer actions; see `CONTRIBUTING.md`.
