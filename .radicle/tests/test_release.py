"""Exercise release orchestration with real git archives and fake external services."""

import importlib.util
import io
import json
import os
import struct
import subprocess
import sys
import tarfile
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location(
    "release", Path(__file__).parents[1] / "release.py"
)
release = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(release)
IMAGE = "docker.io/stellar/stellar-cli@sha256:" + "a" * 64
IPFS = "bafy" + "a" * 40
ARTIFACT_CID = "bafk" + "b" * 40
REAL_RUN = release.run
REAL_POPEN = subprocess.Popen


def leb(value):
    result = bytearray()
    while value >= 128:
        result.append((value & 127) | 128)
        value >>= 7
    return bytes(result + bytes([value]))


def wasm(metadata, payload=b""):
    section = leb(14) + b"contractmetav0"
    for pair in metadata:
        section += struct.pack(">I", 0)
        for value in pair:
            value = value.encode()
            section += struct.pack(">I", len(value)) + value + b"\0" * (-len(value) % 4)
    result = b"\0asm\x01\0\0\0" + b"\0" + leb(len(section)) + section
    if payload:
        section = leb(4) + b"test" + payload
        result += b"\0" + leb(len(section)) + section
    return result


class Process:
    def __init__(self, code):
        self.stdout = io.StringIO("compiler output\n")
        self.code = code

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.stdout.close()

    def wait(self):
        return self.code


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="release test ")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        for package, version in [("tansu", "3.2.1"), ("tansu-executor", "1.4.0")]:
            directory = self.root / "contracts" / package
            directory.mkdir(parents=True)
            (directory / "Cargo.toml").write_text(
                f'[package]\nname="{package}"\nversion="{version}"\n'
            )
        (self.root / "Cargo.lock").write_text("# locked dependencies\n")
        (self.root / "tracked.txt").write_text("tagged source")
        self.git("init", "--quiet")
        self.git("add", ".")
        self.git(
            "-c",
            "user.name=Release Test",
            "-c",
            "user.email=release@example.invalid",
            "commit",
            "--quiet",
            "-m",
            "test source",
        )
        self.git(
            "tag",
            "-a",
            "v3.2.1",
            "-m",
            "test release",
            env={
                **os.environ,
                "GIT_COMMITTER_NAME": "Release Test",
                "GIT_COMMITTER_EMAIL": "release@example.invalid",
            },
        )
        self.commit = self.git("rev-parse", "HEAD").stdout.strip()
        self.output = self.root / "release" / "v3.2.1"
        self.commands = []
        self.build_commands = []
        self.upload_count = 0
        self.fail = None
        self.changed_build = False
        self.namespaced_tag = False
        self.image_manifest = {"config": {}, "layers": []}
        # Keep the test reporter readable; production commands still stream output.
        self.enterContext(redirect_stdout(io.StringIO()))
        self.enterContext(patch.object(release, "run", side_effect=self.command))
        self.enterContext(
            patch.object(release.subprocess, "Popen", side_effect=self.popen)
        )
        self.enterContext(
            patch.dict(os.environ, {"FILEBASE_TOKEN": "test-token-never-in-argv"})
        )

    def git(self, *args, **kwargs):
        return subprocess.run(
            ["git", *args],
            cwd=self.root,
            check=True,
            text=True,
            capture_output=True,
            **kwargs,
        )

    def command(self, *args, **kwargs):
        if args[0] == "git":
            return REAL_RUN(*args, **kwargs)
        self.commands.append((args, kwargs))
        if self.fail and self.fail(args):
            raise subprocess.CalledProcessError(
                1, args, stderr="external service failed"
            )
        output = ""
        if args[:3] == ("docker", "manifest", "inspect"):
            output = json.dumps(self.image_manifest)
        elif args[:3] == ("docker", "image", "inspect"):
            output = json.dumps(
                [
                    {
                        "Os": "linux",
                        "Architecture": "amd64",
                        "Config": {
                            "Entrypoint": ["/usr/local/bin/stellar"],
                            "WorkingDir": "/source",
                        },
                    }
                ]
            )
        elif args[0] == "docker" and "--entrypoint=rustup" in args:
            output = "1.95.0-x86_64-unknown-linux-gnu (default)\n"
        elif args[:3] == ("rad", "inspect", "--rid"):
            output = release.RID
        elif args[0] == "curl":
            self.upload_count += 1
            output = json.dumps({"Hash": IPFS})
        elif args[:2] == ("rad-artifact", "create"):
            if self.namespaced_tag and args[2] != self.commit:
                raise subprocess.CalledProcessError(
                    1, args, stderr="tag exists only in a Radicle namespace"
                )
            output = "d" * 40
        elif args[:2] == ("rad-artifact", "register"):
            output = json.dumps({"cid": ARTIFACT_CID})
        elif args[:3] == ("rad-job", "--no-sync", "run"):
            output = "36c38c31-2a34-46cc-9029-9c7b04f097a0"
        return subprocess.CompletedProcess(args, 0, output, "")

    def popen(self, args, **kwargs):
        if args[0] != "docker":
            return REAL_POPEN(args, **kwargs)
        self.build_commands.append(args)
        if self.fail and self.fail(tuple(args)):
            return Process(1)
        mount = args[args.index("--mount") + 1]
        source = Path(
            mount.removeprefix("type=bind,source=").removesuffix(",target=/source")
        )
        self.assertEqual((source / "tracked.txt").read_text(), "tagged source")
        self.assertFalse((source / "untracked.txt").exists())
        package = next(
            arg.split("=", 1)[1] for arg in args if arg.startswith("--package=")
        )
        metadata = [
            args[i + 1].split("=", 1) for i, arg in enumerate(args) if arg == "--meta"
        ]
        directory = source / "target/wasm32v1-none/release"
        directory.mkdir(parents=True, exist_ok=True)
        artifact = directory / (package.replace("-", "_") + ".wasm")
        artifact.write_bytes(
            wasm(metadata, b"changed" if self.changed_build else b"original")
        )
        return Process(0)

    def build(self, output=None):
        release.build(self.root, "v3.2.1", IMAGE, output or self.output)

    def rehash(self):
        sums = self.output / "SHA256SUMS"
        names = [line.split("  ", 1)[1] for line in sums.read_text().splitlines()]
        sums.write_text(
            "".join(f"{release.digest(self.output / name)}  {name}\n" for name in names)
        )

    def test_build_uses_tag_and_each_package_version(self):
        (self.root / "tracked.txt").write_text("dirty working tree")
        (self.root / "untracked.txt").write_text("not part of tag")
        self.build()
        manifest, files = release.verify(self.output)
        self.assertEqual(manifest["revision"], self.commit)
        self.assertIn("tansu_v3.2.1.wasm", files)
        self.assertIn("tansu-executor_v1.4.0.wasm", files)
        self.assertEqual(len(files), 7)
        self.assertEqual(len(self.build_commands), 2)
        self.assertFalse(
            any(
                args[0] in ("curl", "rad", "rad-job", "rad-artifact")
                for args, _ in self.commands
            )
        )
        for command in self.build_commands:
            self.assertIn("--locked", command)
            self.assertIn("--optimize", command)
            self.assertIn("--platform=linux/amd64", command)
            self.assertIn("RUSTUP_TOOLCHAIN=1.95.0-x86_64-unknown-linux-gnu", command)

    def test_source_and_wasm_bytes_are_repeatable(self):
        self.build()
        other = self.root / "second-build"
        self.build(other)
        for name in (
            "source-v3.2.1.tar",
            "tansu_v3.2.1.wasm",
            "tansu-executor_v1.4.0.wasm",
        ):
            self.assertEqual(
                (self.output / name).read_bytes(), (other / name).read_bytes()
            )
        with tarfile.open(self.output / "source-v3.2.1.tar") as archive:
            self.assertTrue(
                all(item.name.split("/")[0] == "source" for item in archive)
            )

    def test_independent_rebuild(self):
        self.build()
        release.verify(self.output, IMAGE)
        self.assertEqual(len(self.build_commands), 4)

    def test_rebuild_mismatch_fails(self):
        self.build()
        self.changed_build = True
        with self.assertRaisesRegex(ValueError, "Rebuilt WASM differs"):
            release.verify(self.output, IMAGE)

    def test_rebuild_requires_matching_approved_image(self):
        self.build()
        with self.assertRaisesRegex(ValueError, "approved rebuild image"):
            release.verify(self.output, IMAGE.replace("a" * 64, "b" * 64))

    def test_rejects_mutable_image(self):
        with self.assertRaisesRegex(ValueError, "@sha256"):
            release.build(
                self.root, "v3.2.1", "stellar/stellar-cli:latest", self.output
            )
        self.assertFalse(self.output.exists())

    def test_rejects_multiarch_image_digest(self):
        self.image_manifest = {"manifests": []}
        with self.assertRaisesRegex(ValueError, "single-architecture"):
            self.build()
        self.assertFalse(self.output.exists())

    def test_missing_tag_does_not_build(self):
        with self.assertRaises(subprocess.CalledProcessError):
            release.build(self.root, "v99.0.0", IMAGE, self.output)
        self.assertEqual(self.commands, [])

    def test_existing_release_is_not_overwritten(self):
        self.build()
        with self.assertRaises(FileExistsError):
            self.build()

    def test_failed_build_retains_log_without_complete_manifest(self):
        self.fail = lambda args: "contract" in args and "build" in args
        with self.assertRaisesRegex(RuntimeError, "Build failed"):
            self.build()
        self.assertIn("compiler output", (self.output / "build.log").read_text())
        self.assertFalse((self.output / "SHA256SUMS").exists())

    def test_tampered_release_files_are_rejected(self):
        self.build()
        for name in (
            "source-v3.2.1.tar",
            "tansu_v3.2.1.wasm",
            "provenance.json",
            "build.log",
        ):
            with self.subTest(name=name):
                path = self.output / name
                original = path.read_bytes()
                path.write_bytes(original + b"tampered")
                with self.assertRaisesRegex(ValueError, "SHA-256 mismatch"):
                    release.verify(self.output)
                path.write_bytes(original)

    def test_embedded_metadata_is_checked(self):
        self.build()
        path = self.output / "tansu_v3.2.1.wasm"
        path.write_bytes(wasm([["home_domain", "wrong.invalid"]]))
        manifest = json.loads((self.output / "build.json").read_text())
        manifest["contracts"][0]["sha256"] = release.digest(path)
        release.write_json(self.output / "build.json", manifest)
        release.write_json(
            self.output / "provenance.json", release.provenance(manifest)
        )
        self.rehash()
        with self.assertRaisesRegex(ValueError, "Embedded metadata mismatch"):
            release.verify(self.output)

    def test_provenance_subject_is_checked_even_when_rehashed(self):
        self.build()
        path = self.output / "provenance.json"
        statement = json.loads(path.read_text())
        statement["subject"][0]["digest"]["sha256"] = "0" * 64
        release.write_json(path, statement)
        self.rehash()
        with self.assertRaisesRegex(ValueError, "Provenance does not match"):
            release.verify(self.output)

    def test_checksums_must_cover_whole_release(self):
        self.build()
        sums = self.output / "SHA256SUMS"
        sums.write_text("\n".join(sums.read_text().splitlines()[1:]) + "\n")
        with self.assertRaisesRegex(ValueError, "complete release"):
            release.verify(self.output)

    def test_publish_with_namespaced_tag(self):
        self.build()
        self.namespaced_tag = True
        release.publish(self.root, self.output)

    def test_publish_signs_and_registers_all_artifacts(self):
        self.build()
        release.publish(self.root, self.output)
        commands = [args for args, _ in self.commands]
        registers = [
            args for args in commands if args[:2] == ("rad-artifact", "register")
        ]
        self.assertEqual(len(registers), 7)
        self.assertEqual(Path(registers[-1][2]).name, "SHA256SUMS")
        self.assertEqual(self.upload_count, 7)
        self.assertTrue(
            any(args[:3] == ("rad-job", "--no-sync", "succeeded") for args in commands)
        )
        job_run = next(
            args for args in commands if args[:3] == ("rad-job", "--no-sync", "run")
        )
        self.assertEqual(job_run[3:], (self.commit, f"ipfs://{IPFS}"))
        for args, kwargs in self.commands:
            self.assertNotIn("test-token-never-in-argv", " ".join(args))
            if args[0] == "curl":
                self.assertIn("test-token-never-in-argv", kwargs["input"])
        # Radicle blob CIDs and Filebase UnixFS CIDs are deliberately different.
        locations = [
            args for args in commands if args[:3] == ("rad-artifact", "location", "add")
        ]
        self.assertTrue(
            all(
                args[3] == f"ipfs://{IPFS}" and ARTIFACT_CID in args
                for args in locations
            )
        )

    def test_failed_registration_records_failed_job(self):
        self.build()
        self.fail = lambda args: args[:2] == ("rad-artifact", "register")
        with self.assertRaises(subprocess.CalledProcessError):
            release.publish(self.root, self.output)
        commands = [args for args, _ in self.commands]
        self.assertTrue(
            any(args[:3] == ("rad-job", "--no-sync", "failed") for args in commands)
        )
        self.assertFalse(
            any(args[:3] == ("rad-job", "--no-sync", "succeeded") for args in commands)
        )

    def test_failed_upload_records_failed_job(self):
        self.build()
        self.fail = lambda args: args[0] == "curl" and self.upload_count >= 1
        with self.assertRaises(subprocess.CalledProcessError):
            release.publish(self.root, self.output)
        self.assertTrue(
            any(
                args[:3] == ("rad-job", "--no-sync", "failed")
                for args, _ in self.commands
            )
        )

    def test_tampered_release_is_never_uploaded(self):
        self.build()
        (self.output / "build.log").write_text("tampered")
        with self.assertRaisesRegex(ValueError, "SHA-256 mismatch"):
            release.publish(self.root, self.output)
        self.assertEqual(self.upload_count, 0)

    def test_moved_tag_is_never_uploaded(self):
        self.build()
        (self.root / "tracked.txt").write_text("new revision")
        self.git("add", ".")
        self.git(
            "-c",
            "user.name=Release Test",
            "-c",
            "user.email=release@example.invalid",
            "commit",
            "--quiet",
            "-m",
            "new source",
        )
        self.git("tag", "--force", "v3.2.1")
        with self.assertRaisesRegex(ValueError, "tag moved"):
            release.publish(self.root, self.output)
        self.assertEqual(self.upload_count, 0)

    def test_missing_token_is_rejected(self):
        self.build()
        with (
            patch.dict(os.environ, {"FILEBASE_TOKEN": ""}),
            self.assertRaisesRegex(ValueError, "FILEBASE_TOKEN"),
        ):
            release.publish(self.root, self.output)
        self.assertEqual(self.upload_count, 0)

    def test_command_output_is_utf8_on_windows_too(self):
        result = REAL_RUN(
            sys.executable,
            "-c",
            "import sys; sys.stdout.buffer.write(bytes.fromhex('e284b9efb88f'))",
        )
        self.assertEqual(result.stdout, "\u2139\ufe0f")


if __name__ == "__main__":
    unittest.main()
