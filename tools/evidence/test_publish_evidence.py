# /// script
# requires-python = ">=3.10"
# dependencies = ["pytest"]
# ///
"""
Unit tests for tools/evidence/publish_evidence.py.

These tests never touch the network or a real Stellar / IPFS endpoint: every
shell-out goes through ``publish_evidence._run``, which is monkeypatched here.

Run with:  uv run --with pytest pytest tools/evidence/test_publish_evidence.py
"""

from __future__ import annotations

import hashlib
import json
import subprocess
from pathlib import Path

import pytest

import publish_evidence as pe


@pytest.fixture
def artifact(tmp_path: Path) -> Path:
    path = tmp_path / "sbom.cyclonedx.json"
    path.write_text('{"bomFormat": "CycloneDX"}')
    return path


def test_compute_digest_matches_hashlib(artifact: Path):
    expected = "sha256:" + hashlib.sha256(artifact.read_bytes()).hexdigest()
    assert pe.compute_digest(artifact) == expected


def test_invalid_kind_is_rejected_by_parser():
    with pytest.raises(SystemExit):
        pe.build_parser().parse_args(
            [
                "--project-key", "ab",
                "--commit-hash", "cd",
                "--kind", "bogus",
                "--file", "x",
            ]
        )


def test_missing_file_raises(tmp_path: Path):
    args = pe.build_parser().parse_args(
        [
            "--project-key", "ab",
            "--commit-hash", "cd",
            "--kind", "sbom",
            "--file", str(tmp_path / "nope.json"),
            "--contract-id", "C123",
            "--source-account", "ci",
        ]
    )
    with pytest.raises(pe.EvidenceError, match="not found"):
        pe.run(args)


def test_empty_file_raises(tmp_path: Path):
    empty = tmp_path / "empty.json"
    empty.write_text("")
    args = pe.build_parser().parse_args(
        [
            "--project-key", "ab",
            "--commit-hash", "cd",
            "--kind", "sbom",
            "--file", str(empty),
            "--contract-id", "C123",
            "--source-account", "ci",
        ]
    )
    with pytest.raises(pe.EvidenceError, match="empty"):
        pe.run(args)


def test_custom_upload_command_invoked_and_cid_parsed(
    artifact: Path, monkeypatch
):
    monkeypatch.setenv("TANSU_IPFS_UPLOAD_COMMAND", "ipfs add --cid-version=1 --quieter")
    monkeypatch.delenv("FILEBASE_TOKEN", raising=False)
    recorded: list[list[str]] = []

    def fake_run(cmd, **kwargs):
        recorded.append(cmd)
        return subprocess.CompletedProcess(cmd, 0, stdout="bafyCID123\n", stderr="")

    monkeypatch.setattr(pe, "_run", fake_run)

    cid = pe.upload_to_ipfs(artifact)

    assert cid == "bafyCID123"
    assert recorded == [["ipfs", "add", "--cid-version=1", "--quieter", str(artifact)]]


def test_no_upload_method_configured_raises(artifact: Path, monkeypatch):
    monkeypatch.delenv("TANSU_IPFS_UPLOAD_COMMAND", raising=False)
    monkeypatch.delenv("FILEBASE_TOKEN", raising=False)
    with pytest.raises(pe.EvidenceError, match="no IPFS upload method"):
        pe.upload_to_ipfs(artifact)


def test_filebase_cid_parsing():
    stdout = '{"Name":"sbom.json","Hash":"bafyFILEBASE","Size":"123"}\n'
    assert pe._parse_filebase_cid(stdout) == "bafyFILEBASE"


def test_set_evidence_passes_cid_and_kind_variant(monkeypatch):
    recorded: list[list[str]] = []

    def fake_run(cmd, **kwargs):
        recorded.append(cmd)
        return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")

    monkeypatch.setattr(pe, "_run", fake_run)
    cmd = pe.set_evidence(
        network="testnet",
        contract_id="C123",
        source_account="ci",
        maintainer="GMAINTAINER",
        project_key="abc",
        commit_hash="deadbeef",
        kind_variant="Sbom",
        cid="bafyCID",
    )

    assert "--cid" in cmd and cmd[cmd.index("--cid") + 1] == "bafyCID"
    assert "--kind" in cmd and cmd[cmd.index("--kind") + 1] == "Sbom"
    assert recorded and recorded[0] == cmd


def test_dry_run_does_not_invoke(monkeypatch):
    called = False

    def fake_run(cmd, **kwargs):
        nonlocal called
        called = True
        return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")

    monkeypatch.setattr(pe, "_run", fake_run)
    cmd = pe.set_evidence(
        network="testnet",
        contract_id="C123",
        source_account="ci",
        maintainer="GM",
        project_key="abc",
        commit_hash="deadbeef",
        kind_variant="Cve",
        cid="bafyCID",
        dry_run=True,
    )
    assert called is False
    assert cmd[cmd.index("--kind") + 1] == "Cve"


def test_full_run_uploads_then_sets_evidence(artifact: Path, monkeypatch, capsys):
    monkeypatch.setenv("TANSU_IPFS_UPLOAD_COMMAND", "fakeipfs")
    monkeypatch.delenv("FILEBASE_TOKEN", raising=False)
    calls: list[list[str]] = []

    def fake_run(cmd, **kwargs):
        calls.append(cmd)
        if cmd[:2] == ["stellar", "keys"]:
            return subprocess.CompletedProcess(cmd, 0, stdout="GDERIVED\n", stderr="")
        if "set_evidence" in cmd:
            return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")
        # upload command
        return subprocess.CompletedProcess(cmd, 0, stdout="bafyUPLOADED\n", stderr="")

    monkeypatch.setattr(pe, "_run", fake_run)

    args = pe.build_parser().parse_args(
        [
            "--project-key", "abc",
            "--commit-hash", "deadbeef",
            "--kind", "attestation",
            "--file", str(artifact),
            "--contract-id", "C123",
            "--source-account", "ci",
        ]
    )
    assert pe.run(args) == 0

    summary = json.loads(capsys.readouterr().out.strip())
    assert summary["cid"] == "bafyUPLOADED"
    assert summary["kind"] == "attestation"

    invoke = next(c for c in calls if "set_evidence" in c)
    assert invoke[invoke.index("--cid") + 1] == "bafyUPLOADED"
    assert invoke[invoke.index("--kind") + 1] == "Attestation"
    assert invoke[invoke.index("--maintainer") + 1] == "GDERIVED"
