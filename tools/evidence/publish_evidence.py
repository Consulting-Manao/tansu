# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///
"""
Publish off-chain supply-chain evidence for a Tansu project commit.

This is the producer side of the evidence feature: it takes an artifact that was
generated off-chain (an SBOM, a vulnerability scan, an attestation manifest, ...),
uploads it to IPFS, and records the resulting content identifier (CID) on-chain by
calling the contract's ``set_evidence``.

The contract stores only the CID and a ledger timestamp. The artifact itself stays
off-chain on IPFS. An IPFS CIDv1 is already a content-addressed multihash of the
bytes, so re-downloading by CID is self-verifying; this tool also prints a plain
``sha256`` digest for human-readable logs, but that digest is *not* stored on-chain.

Pipeline
--------
1. validate evidence kind and artifact file
2. compute a sha256 digest (informational, for logs / job summaries)
3. upload the artifact to IPFS and capture the CID
4. call ``set_evidence(maintainer, project_key, commit_hash, kind, cid)``

IPFS upload is pluggable:

* If ``TANSU_IPFS_UPLOAD_COMMAND`` is set, it is run with the artifact path appended
  as the final argument and must print the CID as the last whitespace-separated
  token on stdout (e.g. ``ipfs add --cid-version=1 --quieter``).
* Otherwise, if ``FILEBASE_TOKEN`` is set, the artifact is uploaded to Filebase's
  IPFS pinning RPC (the same provider the dApp and SBOM workflows already use).

Signing of the ``set_evidence`` transaction is delegated to the ``stellar`` CLI, so
the calling environment is expected to have a configured source account (key alias),
exactly like the Makefile contract targets.

Example
-------
    uv run tools/evidence/publish_evidence.py \\
        --project-key 37ae83c0...e156 \\
        --commit-hash bc4d84f2...8720 \\
        --kind sbom \\
        --file artifacts/sbom.cyclonedx.json \\
        --network testnet \\
        --contract-id C... \\
        --source-account tansu-testnet
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shlex
import subprocess
import sys
from pathlib import Path

# Map the CLI-friendly lowercase kind to the contract's EvidenceKind enum variant.
KIND_MAP = {
    "sbom": "Sbom",
    "cve": "Cve",
    "attestation": "Attestation",
}

FILEBASE_ADD_URL = "https://rpc.filebase.io/api/v0/add?cid-version=1"


class EvidenceError(RuntimeError):
    """Raised for any recoverable, user-facing failure."""


def _run(cmd: list[str], **kwargs) -> subprocess.CompletedProcess:
    """Thin wrapper around subprocess.run so tests can intercept all shell-outs."""
    return subprocess.run(
        cmd,
        check=True,
        text=True,
        capture_output=True,
        **kwargs,
    )


def compute_digest(path: Path) -> str:
    """Return ``sha256:<hex>`` for the file at ``path``."""
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return f"sha256:{digest.hexdigest()}"


def _parse_filebase_cid(stdout: str) -> str:
    """Extract the CID from a Filebase /api/v0/add response (newline-delimited JSON)."""
    cid = ""
    for line in stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            continue
        cid = payload.get("Hash") or payload.get("Cid") or cid
    if not cid:
        raise EvidenceError(
            "could not determine CID from Filebase response:\n" + stdout
        )
    return cid


def upload_to_ipfs(path: Path) -> str:
    """Upload ``path`` to IPFS and return its CID.

    Uses ``TANSU_IPFS_UPLOAD_COMMAND`` when set, otherwise falls back to Filebase
    when ``FILEBASE_TOKEN`` is present.
    """
    custom = os.environ.get("TANSU_IPFS_UPLOAD_COMMAND", "").strip()
    if custom:
        cmd = shlex.split(custom) + [str(path)]
        result = _run(cmd)
        tokens = result.stdout.split()
        if not tokens:
            raise EvidenceError(f"upload command produced no output: {custom!r}")
        return tokens[-1]

    token = os.environ.get("FILEBASE_TOKEN", "").strip()
    if token:
        cmd = [
            "curl",
            "--silent",
            "--show-error",
            "--fail",
            "-X",
            "POST",
            "-H",
            f"Authorization: Bearer {token}",
            FILEBASE_ADD_URL,
            "-F",
            f"file=@{path};filename={path.name}",
        ]
        result = _run(cmd)
        return _parse_filebase_cid(result.stdout)

    raise EvidenceError(
        "no IPFS upload method configured: set TANSU_IPFS_UPLOAD_COMMAND "
        "or FILEBASE_TOKEN"
    )


def resolve_maintainer(source_account: str, maintainer: str | None) -> str:
    """Return the maintainer address, deriving it from the source account if needed."""
    if maintainer:
        return maintainer
    result = _run(["stellar", "keys", "address", source_account])
    return result.stdout.strip()


def set_evidence(
    *,
    network: str,
    contract_id: str,
    source_account: str,
    maintainer: str,
    project_key: str,
    commit_hash: str,
    kind_variant: str,
    cid: str,
    dry_run: bool = False,
) -> list[str]:
    """Invoke the contract's ``set_evidence``. Returns the command that was (or would be) run."""
    cmd = [
        "stellar",
        "contract",
        "invoke",
        "--source-account",
        source_account,
        "--network",
        network,
        "--id",
        contract_id,
        "--",
        "set_evidence",
        "--maintainer",
        maintainer,
        "--project_key",
        project_key,
        "--commit_hash",
        commit_hash,
        "--kind",
        kind_variant,
        "--cid",
        cid,
    ]
    if not dry_run:
        _run(cmd)
    return cmd


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Publish off-chain evidence for a Tansu project commit.",
    )
    parser.add_argument(
        "--project-key",
        required=True,
        help="Project key (hex), i.e. keccak256(project name).",
    )
    parser.add_argument(
        "--commit-hash",
        required=True,
        help="Commit hash this evidence describes.",
    )
    parser.add_argument(
        "--kind",
        required=True,
        choices=sorted(KIND_MAP),
        help="Evidence kind.",
    )
    parser.add_argument(
        "--file",
        required=True,
        type=Path,
        help="Path to the artifact to upload.",
    )
    parser.add_argument(
        "--network",
        default=os.environ.get("TANSU_NETWORK", "testnet"),
        help="Stellar network (default: $TANSU_NETWORK or 'testnet').",
    )
    parser.add_argument(
        "--contract-id",
        default=os.environ.get("TANSU_CONTRACT_ID"),
        help="Tansu contract id (default: $TANSU_CONTRACT_ID).",
    )
    parser.add_argument(
        "--source-account",
        default=os.environ.get("TANSU_SOURCE_ACCOUNT"),
        help="stellar CLI key alias used to sign (default: $TANSU_SOURCE_ACCOUNT).",
    )
    parser.add_argument(
        "--maintainer",
        default=os.environ.get("TANSU_MAINTAINER"),
        help="Maintainer address (default: $TANSU_MAINTAINER, else derived from source account).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Upload to IPFS but print the set_evidence command instead of running it.",
    )
    return parser


def run(args: argparse.Namespace) -> int:
    if not args.contract_id:
        raise EvidenceError("missing --contract-id (or $TANSU_CONTRACT_ID)")
    if not args.source_account:
        raise EvidenceError("missing --source-account (or $TANSU_SOURCE_ACCOUNT)")

    path: Path = args.file
    if not path.is_file():
        raise EvidenceError(f"artifact not found: {path}")
    if path.stat().st_size == 0:
        raise EvidenceError(f"artifact is empty: {path}")

    kind_variant = KIND_MAP[args.kind]

    digest = compute_digest(path)
    print(f"artifact: {path}", file=sys.stderr)
    print(f"digest:   {digest} (informational; not stored on-chain)", file=sys.stderr)

    cid = upload_to_ipfs(path)
    print(f"cid:      {cid}", file=sys.stderr)

    maintainer = resolve_maintainer(args.source_account, args.maintainer)

    cmd = set_evidence(
        network=args.network,
        contract_id=args.contract_id,
        source_account=args.source_account,
        maintainer=maintainer,
        project_key=args.project_key,
        commit_hash=args.commit_hash,
        kind_variant=kind_variant,
        cid=cid,
        dry_run=args.dry_run,
    )

    if args.dry_run:
        print("[dry-run] " + shlex.join(cmd), file=sys.stderr)

    # Machine-readable summary on stdout (stderr carries the human log above).
    print(
        json.dumps(
            {
                "project_key": args.project_key,
                "commit_hash": args.commit_hash,
                "kind": args.kind,
                "cid": cid,
                "digest": digest,
                "dry_run": args.dry_run,
            }
        )
    )
    return 0


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return run(args)
    except EvidenceError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    except subprocess.CalledProcessError as exc:
        print(f"error: command failed: {shlex.join(exc.cmd)}", file=sys.stderr)
        if exc.stderr:
            print(exc.stderr, file=sys.stderr)
        return exc.returncode or 1


if __name__ == "__main__":
    raise SystemExit(main())
