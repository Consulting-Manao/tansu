# Radicle CI/CD

Install Python 3.12+ and `cargo install radicle-artifact radicle-job --locked`.

## CI ([`ci.sh`](ci.sh))

Runs from the repo root via **`make radicle_ci`** or **`.radicle/ci.sh`**.

1. **`git fetch rad`** and **`refs/heads/rad-ci`** when present.
2. **Orphan worktree** (`radicle-ci-<pid>`) so you can keep a local **`rad-ci`** checkout elsewhere.
3. **Restore** prior logs from **`rad/rad-ci`** into **`.radicle/ci/`** when that tree exists on the remote branch; otherwise first-run message only.
4. **`rad-job new`** / **`run`** (Explorer log URL), then the release pipeline tests and **`cargo test`** (same as **`make contract_test`**) with output in **`.radicle/ci/<YYYY-MM-DD>_<full-sha>.log`**.
5. **`rad-job succeeded`** or **`failed`** for the run UUID, then **commit** all of **`.radicle/ci`** and **`git push --force rad HEAD:refs/heads/rad-ci`**.

Remote **`rad`**, branch **`rad-ci`**.

**Explorer log URL:**  
`https://radicle.network/nodes/<host>/<rid>/remotes/<nid>/tree/rad-ci/.radicle/ci/<YYYY-MM-DD>_<sha>.log`  
- **`<host>`:** **`RADICLE_LOG_NODE`** (default **`iris.radicle.xyz`**)  
- **`<nid>`:** last path segment of **`remote.rad.pushurl`** (`rad://<rid>/<nid>`)

The script **exits with the failing test command's exit code**, or zero when both pass. Failed commands still produce a failed job and an archived log.

Logs on **`rad-ci`** are pruned automatically after 90 days by parsing the **`<YYYY-MM-DD>`** date prefix in each filename. Old job COBs are **not** pruned (`rad-job` has no delete subcommand).
Keeping a recent log must also leave a successful shell status, so a subsequent
CI run reaches its tests instead of exiting during pruning under `set -e`.

## Local contract releases

[`release.sh`](release.sh) runs [`release.py`](release.py), using only Python's
standard library. Requirements: Python 3.12+, Git, Docker, and a running Docker
engine. Publishing additionally needs an authenticated Radicle identity, the
Tansu repository in local Radicle storage, `radicle-artifact` 0.23.1+,
`radicle-job` 0.6.0+, curl, and `FILEBASE_TOKEN` in the environment. Neither
building nor checking a release requires credentials or a GitHub service.

### Build

Choose a trusted Stellar CLI build image that includes Rust, the
`wasm32v1-none` target, and optimization support. Its entrypoint must execute
`stellar` and its working directory must be `/source`. Copy the **single
architecture** digest for your desired image from its registry; the command
rejects mutable tags and multi-architecture manifest lists. Use the same image
for independent rebuilds. An SDK upgrade may require choosing a newer image.

```bash
export IMAGE='docker.io/stellar/stellar-cli@sha256:<single-architecture-digest>'
make radicle_release tag=v3.0.1 image="$IMAGE"
# Or: bash .radicle/release.sh build --tag v3.0.1 --image "$IMAGE"
```

The tag must already exist locally. The build archives the tag's **peeled
commit**, then extracts that archive into a fresh temporary directory: dirty
working files, local build caches, and whatever branch is checked out do not
become release inputs. `git archive` produces the exact retained
`source-<tag>.tar` with one top-level `source/` directory. The image's installed
Rust toolchain is selected explicitly, preventing a source-level toolchain
selector from downloading a different compiler. Both packages are built with
`--locked`, `--profile=release`, and `--optimize`, Tansu first.

The output is `release/<tag>/` (or `--output <new-directory>`):

- Both WASMs, named with each package's version from the tagged Cargo manifests.
- `source-<tag>.tar`, whose exact bytes are identified by SHA-256.
- `build.json`: revision, image, architecture, toolchain, environment, arguments,
  metadata, and output hashes.
- `provenance.json`: an in-toto v1 statement with a SLSA provenance v1 predicate
  binding the two WASM hashes to the revision, source archive, and build recipe.
- `build.log`, including the invocation ID, commands, and compiler output.
- `SHA256SUMS`, covering all of the above, written only after successful builds.

An existing output directory is never overwritten. A failed build retains its
log but produces no complete checksum manifest; it cannot be published. Use a
new `--output` directory for a retry.

### Verify and rebuild

```bash
make radicle_release_verify tag=v3.0.1
make radicle_release_verify tag=v3.0.1 image="$IMAGE"
# Or, without a checkout:
python3 /path/to/release.py verify /path/to/downloaded-release
python3 /path/to/release.py verify /path/to/downloaded-release --rebuild-image "$IMAGE"
```

The first form checks all file hashes, the WASMs' actual `contractmetav0`
metadata, and the provenance subjects and recipe. It is an offline integrity
check, not a statement about who produced the files. The second form also
extracts the retained source into a fresh directory, replays both builds in
the explicitly approved image, and compares the resulting WASMs byte for byte
by SHA-256. Approve the image and inspect the source before executing a rebuild.

### Publish and attest on Radicle

After reviewing the artifacts, make sure the tag and commit are available in
your local Radicle repository (for example, `git push rad tag v3.0.1`), then:

```bash
export FILEBASE_TOKEN='...'
make radicle_release_publish tag=v3.0.1
# Or: bash .radicle/release.sh publish release/v3.0.1
```

Publication rechecks the whole release and refuses a moved tag. It uploads the
build log to IPFS, then starts a signed `rad-job` publication run for the
release commit with that real `ipfs://` log location. The run records the
publication of the completed local build; it does not assert that a separate
CI runner performed the compilation. Each of the seven files, including source
and provenance, is uploaded to Filebase and registered in one explicitly
selected Radicle release keyed by the verified commit, with its IPFS download
location. The tag remains in the provenance and artifact names: a pushed tag
can exist only in a delegate's namespace and fail unqualified name resolution
in `rad-artifact`. The token is sent
through curl's standard input rather than exposed in process arguments.

Radicle's signed registration binds the publisher to the artifact's blob CID.
The Filebase UnixFS CID is a download location, not that blob CID. Both are
kept separately. `SHA256SUMS` is registered last as the complete release index.
The job is marked successful only after artifact registration and announcement;
upload/registration failures mark it failed and exit nonzero. A partial release
can remain visible on failure. Re-running `publish` reuses the author's release
and the same content-addressed artifacts, with a new job run. A final sync
failure also exits nonzero; retry to announce the local signed records.

Consumers first replicate the repository and inspect the release and its
signers, then verify the downloaded release index against trusted Radicle
registrations before using the hashes it contains:

```bash
REV=$(git rev-parse 'v3.0.1^{commit}')
rad-artifact show --pretty "$REV"
rad-artifact verify release/v3.0.1/SHA256SUMS
make radicle_release_verify tag=v3.0.1 image="$IMAGE"
# An independent delegate who checked the bytes/rebuild can attest the blob CID:
rad-artifact attest --revision "$REV" --cid <registered-blob-cid> --no-input
rad sync --announce
```

Registering already counts as the author's attestation. `attest` is for another
reviewer, so the publisher does not attest its own registration a second time.
No Stellar transaction is sent by these commands. Registry publication is a
separate integration (issue #255); upgrade approval remains a manual operation.
To record a reviewed release as evidence on Tansu itself, the existing manual
`make contract_release tag=v3.0.1 network=<network>` now checks the release and
local tag, then records `release/<tag>/provenance.json` for both WASM subjects.
That command requires the project's maintainer identity and sends transactions.

### SEP-55 and SEP-58

Both WASMs carry the [SEP-55](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0055.md)
fields `source_repo=github:Consulting-Manao/tansu` (the source mirror) and
`home_domain=tansu.dev`. The in-toto/SLSA statement includes the mirror URI and
commit in `resolvedDependencies[0]`, the primary Radicle repository, and the
source archive digest. Signing/discovery uses Radicle COBs instead of GitHub
OIDC/attestation APIs. **The original SEP-55 GitHub attestation lookup will not
verify these releases**: that verifier needs support for the Radicle trust and
discovery mechanism. This is a local, signer-attested build, with no claim of a
GitHub attestation or an isolated SLSA builder/security level.

For [SEP-58](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0058.md),
the WASMs embed `bldimg` (a single-architecture, registry-qualified digest), a
repeated `bldopt` for every build option, and `source_sha256` (the exact retained
archive). The default `bldarg` sequence is `contract build`. `source_uri` is
omitted: the signed Radicle release provides the content-addressed archive and
its IPFS retrieval location. A source archive hash must identify the archive
bytes, not a Git commit, and an image digest must identify one architecture.

### Pipeline tests

```bash
make radicle_release_test
```

Tests use real temporary Git repositories/tags/archives and simulate Docker,
Radicle and Filebase. They cover dirty checkouts, repeatable source bytes,
independent rebuilds, differing package versions, embedded metadata and
provenance, tampering, build/upload failures, moved tags, namespaced release tags, and signed publication
ordering. They run in Rad CI before the contract tests. They require neither
network credentials nor a Docker daemon; a real build/rebuild is still the
release operator's check for the selected compiler image.
