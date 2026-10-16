"""Local contract releases: pinned builds, reproducible sources, signed Radicle artifacts."""

import argparse
import hashlib
import json
import os
import re
import shlex
import shutil
import struct
import subprocess
import sys
import tarfile
import tempfile
import tomllib
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

RID = "rad:zssaAF91kxuquZmZCV2SiK2FNX6s"
SOURCE_REPO = "github:Consulting-Manao/tansu"  # SEP-55 discovery via the mirror
SOURCE_URL = "https://github.com/Consulting-Manao/tansu"
RADICLE_URL = f"https://radicle.network/nodes/radicle.consulting-manao.com/{RID}"
BUILD_TYPE = f"{RADICLE_URL}/tree/main/.radicle/release.py"
PACKAGES = ("tansu", "tansu-executor")
IMAGE_RE = r"(?:localhost(?::\d+)?|[^\s@/]*[.:][^\s@/]*)/[^\s@]+@sha256:[0-9a-f]{64}"


def run(*args, cwd=None, check=True, input=None):
    return subprocess.run(
        args,
        cwd=cwd,
        check=check,
        input=input,
        text=True,
        capture_output=True,
        encoding="utf-8",
        errors="replace",
    )


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def now():
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def revision(root, tag):
    if not re.fullmatch(r"v[0-9][A-Za-z0-9.+_-]*", tag):
        raise ValueError("Use a release tag such as v3.0.1")
    return run(
        "git", "rev-parse", "--verify", f"refs/tags/{tag}^{{commit}}", cwd=root
    ).stdout.strip()


def inspect_image(image):
    if not re.fullmatch(IMAGE_RE, image):
        raise ValueError(
            "The build image must include a registry host and @sha256:<digest>"
        )
    print(f"Preparing pinned build image: {image}", flush=True)
    manifest = json.loads(run("docker", "manifest", "inspect", image).stdout)
    if "manifests" in manifest or "config" not in manifest or "layers" not in manifest:
        raise ValueError(
            "Use a single-architecture image digest, not a manifest list/index"
        )
    run("docker", "pull", image)
    config = json.loads(run("docker", "image", "inspect", image).stdout)[0]
    entrypoint = config["Config"].get("Entrypoint") or []
    if not entrypoint or Path(entrypoint[-1]).name != "stellar":
        raise ValueError("The build image entrypoint must execute stellar")
    if config["Config"].get("WorkingDir") != "/source":
        raise ValueError("The build image WORKDIR must be /source")
    toolchain = run(
        "docker",
        "run",
        "--rm",
        "--entrypoint=rustup",
        image,
        "show",
        "active-toolchain",
    ).stdout.split()[0]
    return f"{config['Os']}/{config['Architecture']}", toolchain


def recipe(package, image, source_hash):
    options = [f"--package={package}", "--profile=release", "--locked", "--optimize"]
    metadata = [
        ["source_repo", SOURCE_REPO],
        ["home_domain", "tansu.dev"],
        ["bldimg", image],
        *[["bldopt", option] for option in options],
        ["source_sha256", source_hash],
    ]
    return options, metadata


def extract_source(archive, destination):
    with tarfile.open(archive) as source:
        if any(Path(member.name).parts[0] != "source" for member in source):
            raise ValueError("The source archive must have a single source/ directory")
        source.extractall(destination, filter="data")
    return destination / "source"


def build_contract(source, manifest, contract, log):
    command = [
        "docker",
        "run",
        "--rm",
        f"--platform={manifest['platform']}",
        "--mount",
        f"type=bind,source={source},target=/source",
        "--env",
        f"RUSTUP_TOOLCHAIN={manifest['toolchain']}",
        "--env",
        f"SOURCE_DATE_EPOCH={manifest['sourceDateEpoch']}",
        manifest["image"],
        "contract",
        "build",
        *contract["options"],
    ]
    for key, value in contract["metadata"]:
        command.extend(["--meta", f"{key}={value}"])
    if hasattr(os, "getuid"):
        command[3:3] = ["--user", f"{os.getuid()}:{os.getgid()}"]
    log.write(f"$ {shlex.join(command)}\n")
    log.flush()
    # Retain the compiler output even if the build fails.
    with subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
    ) as process:
        for line in process.stdout:
            print(line, end="", flush=True)
            if log is not sys.stdout:
                log.write(line)
        if process.wait():
            raise RuntimeError(f"Build failed for {contract['package']}; see build.log")
    return (
        source
        / "target/wasm32v1-none/release"
        / (contract["package"].replace("-", "_") + ".wasm")
    )


def provenance(manifest):
    return {
        "_type": "https://in-toto.io/Statement/v1",
        "subject": [
            {"name": item["file"], "digest": {"sha256": item["sha256"]}}
            for item in manifest["contracts"]
        ],
        "predicateType": "https://slsa.dev/provenance/v1",
        "predicate": {
            "buildDefinition": {
                "buildType": BUILD_TYPE,
                "externalParameters": {
                    "tag": manifest["tag"],
                    "image": manifest["image"],
                    "platform": manifest["platform"],
                    "contracts": manifest["contracts"],
                },
                "internalParameters": {
                    "RUSTUP_TOOLCHAIN": manifest["toolchain"],
                    "SOURCE_DATE_EPOCH": manifest["sourceDateEpoch"],
                },
                "resolvedDependencies": [
                    {"uri": SOURCE_URL, "digest": {"gitCommit": manifest["revision"]}},
                    {"uri": RID, "digest": {"gitCommit": manifest["revision"]}},
                    {
                        "uri": "urn:sha256:" + manifest["source"]["sha256"],
                        "digest": {"sha256": manifest["source"]["sha256"]},
                    },
                ],
            },
            "runDetails": {
                "builder": {"id": BUILD_TYPE},
                "metadata": {
                    "invocationId": manifest["invocationId"],
                    "startedOn": manifest["startedOn"],
                    "finishedOn": manifest["finishedOn"],
                },
                "byproducts": [{"name": "build.log"}],
            },
        },
    }


def build(root, tag, image, output):
    commit = revision(root, tag)
    platform, toolchain = inspect_image(image)
    output.mkdir(parents=True, exist_ok=False)
    archive = output / f"source-{tag}.tar"
    run(
        "git",
        "archive",
        "--format=tar",
        "--prefix=source/",
        f"--output={archive}",
        commit,
        cwd=root,
    )
    manifest = {
        "schemaVersion": 1,
        "repository": RID,
        "tag": tag,
        "revision": commit,
        "image": image,
        "platform": platform,
        "toolchain": toolchain,
        "sourceDateEpoch": run(
            "git", "show", "-s", "--format=%ct", commit, cwd=root
        ).stdout.strip(),
        "source": {"file": archive.name, "sha256": digest(archive)},
        "invocationId": str(uuid4()),
        "startedOn": now(),
        "contracts": [],
    }
    with (
        tempfile.TemporaryDirectory(prefix="tansu-release-") as temporary,
        (output / "build.log").open("w", encoding="utf-8") as log,
    ):
        source = extract_source(archive, Path(temporary))
        log.write(
            f"Release {tag}, revision {commit}, invocation {manifest['invocationId']}\n"
        )
        for package in PACKAGES:
            with (source / "contracts" / package / "Cargo.toml").open("rb") as stream:
                version = tomllib.load(stream)["package"]["version"]
            options, metadata = recipe(package, image, manifest["source"]["sha256"])
            contract = {
                "package": package,
                "version": version,
                "options": options,
                "metadata": metadata,
                "file": f"{package}_v{version}.wasm",
            }
            artifact = build_contract(source, manifest, contract, log)
            shutil.copyfile(artifact, output / contract["file"])
            contract["sha256"] = digest(output / contract["file"])
            manifest["contracts"].append(contract)
    manifest["finishedOn"] = now()
    write_json(output / "build.json", manifest)
    write_json(output / "provenance.json", provenance(manifest))
    files = [
        archive.name,
        "build.log",
        "build.json",
        "provenance.json",
        *[item["file"] for item in manifest["contracts"]],
    ]
    (output / "SHA256SUMS").write_text(
        "".join(f"{digest(output / name)}  {name}\n" for name in sorted(files)),
        encoding="utf-8",
    )
    verify(output)
    print(f"Built {tag} ({commit}) in {output}")


def wasm_metadata(path):
    """Read SEP-46 SCMetaEntry XDR without installing the Stellar SDK."""
    data = path.read_bytes()
    if data[:8] != b"\x00asm\x01\x00\x00\x00":
        raise ValueError(f"Invalid WebAssembly file: {path.name}")

    def leb(offset):
        value = 0
        for shift in range(0, 35, 7):
            byte = data[offset]
            offset += 1
            value |= (byte & 127) << shift
            if byte < 128:
                return value, offset
        raise ValueError("Invalid WebAssembly section length")

    entries, offset = [], 8
    while offset < len(data):
        kind = data[offset]
        size, start = leb(offset + 1)
        offset = start + size
        if offset > len(data):
            raise ValueError("Truncated WebAssembly section")
        if kind != 0:
            continue
        length, cursor = leb(start)
        if data[cursor : cursor + length] != b"contractmetav0":
            continue
        cursor += length
        while cursor < offset:
            discriminant = struct.unpack_from(">I", data, cursor)[0]
            cursor += 4
            if discriminant != 0:
                raise ValueError("Unsupported SCMetaEntry type")
            pair = []
            for _ in range(2):
                length = struct.unpack_from(">I", data, cursor)[0]
                cursor += 4
                pair.append(data[cursor : cursor + length].decode("utf-8"))
                cursor += (length + 3) // 4 * 4
            if cursor > offset:
                raise ValueError("Truncated SCMetaEntry")
            entries.append(pair)
    return entries


def verify(output, rebuild_image=None):
    sums = {}
    for line in (output / "SHA256SUMS").read_text(encoding="utf-8").splitlines():
        expected, name = line.split("  ", 1)
        if (
            not re.fullmatch(r"[0-9a-f]{64}", expected)
            or Path(name).name != name
            or name in sums
        ):
            raise ValueError("Invalid SHA256SUMS entry")
        if digest(output / name) != expected:
            raise ValueError(f"SHA-256 mismatch: {name}")
        sums[name] = expected
    manifest = json.loads((output / "build.json").read_text(encoding="utf-8"))
    if manifest["schemaVersion"] != 1 or manifest["repository"] != RID:
        raise ValueError("Unsupported release manifest")
    contracts = manifest["contracts"]
    if [item["package"] for item in contracts] != list(PACKAGES):
        raise ValueError("The release must contain Tansu and its executor")
    expected_files = {
        "build.json",
        "provenance.json",
        "build.log",
        manifest["source"]["file"],
        *[item["file"] for item in contracts],
    }
    if (
        set(sums) != expected_files
        or sums[manifest["source"]["file"]] != manifest["source"]["sha256"]
    ):
        raise ValueError("The checksums do not cover the complete release")
    for item in contracts:
        options, metadata = recipe(
            item["package"], manifest["image"], manifest["source"]["sha256"]
        )
        if item["options"] != options or item["metadata"] != metadata:
            raise ValueError("The build recipe does not match the release metadata")
        if sums[item["file"]] != item["sha256"]:
            raise ValueError(f"Manifest digest mismatch: {item['file']}")
        keys = {key for key, _ in metadata}
        actual = [
            pair for pair in wasm_metadata(output / item["file"]) if pair[0] in keys
        ]
        if sorted(actual) != sorted(metadata):
            raise ValueError(f"Embedded metadata mismatch: {item['file']}")
    statement = json.loads((output / "provenance.json").read_text(encoding="utf-8"))
    if statement != provenance(manifest):
        raise ValueError("Provenance does not match the release manifest")
    if rebuild_image:
        if rebuild_image != manifest["image"]:
            raise ValueError("The approved rebuild image must match the release image")
        platform, toolchain = inspect_image(rebuild_image)
        if platform != manifest["platform"] or toolchain != manifest["toolchain"]:
            raise ValueError("The rebuild environment does not match the release")
        with tempfile.TemporaryDirectory(prefix="tansu-verify-") as temporary:
            source = extract_source(
                output / manifest["source"]["file"], Path(temporary)
            )
            for item in contracts:
                artifact = build_contract(source, manifest, item, sys.stdout)
                if digest(artifact) != item["sha256"]:
                    raise ValueError(f"Rebuilt WASM differs: {item['file']}")
    print(
        f"Verified release bytes{' and independent rebuild' if rebuild_image else ''}: {output}"
    )
    return manifest, [*sorted(sums), "SHA256SUMS"]


def upload(path, token):
    if not token or any(char in token for char in '\r\n"\\'):
        raise ValueError("FILEBASE_TOKEN must contain an API token")
    result = run(
        "curl",
        "--silent",
        "--show-error",
        "--fail",
        "--max-time",
        "300",
        "--config",
        "-",
        "--form",
        f'file=@"{path.as_posix()}";filename="{path.name}"',
        "https://rpc.filebase.io/api/v0/add?cid-version=1",
        input=f'header = "Authorization: Bearer {token}"\n',
    )
    # Filebase may return newline-delimited JSON; the last entry is the file root.
    cid = json.loads(result.stdout.strip().splitlines()[-1])["Hash"]
    if not re.fullmatch(r"b[a-z2-7]{20,}", cid):
        raise ValueError("Filebase did not return a CIDv1 content identifier")
    return f"ipfs://{cid}"


def publish(root, output):
    manifest, files = verify(output)
    if revision(root, manifest["tag"]) != manifest["revision"]:
        raise ValueError("The release tag moved since this build")
    if run("rad", "inspect", "--rid", cwd=root).stdout.strip() != RID:
        raise ValueError("Publish from the Tansu Radicle repository")
    token = os.environ.get("FILEBASE_TOKEN", "")
    log_url = upload(output / "build.log", token)
    commit = manifest["revision"]

    def job(*args, check=True):
        return run("rad-job", "--no-sync", *args, cwd=root, check=check)

    if job("show", commit, check=False).returncode:
        job("new", commit)
    job_run = job("run", commit, log_url).stdout.strip()
    try:
        release = run(
            "rad-artifact",
            "create",
            manifest["tag"],
            "--no-input",
            "--no-announce",
            cwd=root,
        ).stdout.strip()
        for name in files:
            path = output / name
            location = log_url if name == "build.log" else upload(path, token)
            receipt = json.loads(
                run(
                    "rad-artifact",
                    "register",
                    str(path),
                    "--release",
                    release,
                    "--name",
                    f"{manifest['tag']}/{name}",
                    "--json",
                    "--no-input",
                    "--no-announce",
                    cwd=root,
                ).stdout
            )
            run(
                "rad-artifact",
                "location",
                "add",
                location,
                "--release",
                release,
                "--cid",
                receipt["cid"],
                "--no-input",
                "--no-announce",
                cwd=root,
            )
        # Flush artifact registrations before declaring publication successful.
        run("rad", "sync", "--announce", cwd=root)
    except BaseException:
        job("failed", commit, job_run, check=False)
        run("rad", "sync", "--announce", cwd=root, check=False)
        raise
    job("succeeded", commit, job_run)
    run("rad", "sync", "--announce", cwd=root)
    print(
        f"Published {manifest['tag']} as Radicle release {release}, job run {job_run}"
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    builder = commands.add_parser(
        "build", help="Build both contracts from a tag in a pinned image"
    )
    builder.add_argument("--tag", required=True)
    builder.add_argument(
        "--image",
        required=True,
        help="Single-architecture registry image@sha256:digest",
    )
    builder.add_argument("--output", type=Path)
    verifier = commands.add_parser(
        "verify", help="Check checksums, embedded metadata, and provenance"
    )
    verifier.add_argument("directory", type=Path)
    verifier.add_argument(
        "--tag", help="Also check this local tag still identifies the built commit"
    )
    verifier.add_argument(
        "--rebuild-image",
        help="Independently rebuild with this explicitly approved image",
    )
    publisher = commands.add_parser(
        "publish", help="Upload files and sign release/job records on Radicle"
    )
    publisher.add_argument("directory", type=Path)
    args = parser.parse_args()
    if args.command == "verify":
        manifest, _ = verify(args.directory.resolve(), args.rebuild_image)
        if args.tag and (
            manifest["tag"] != args.tag
            or revision(None, args.tag) != manifest["revision"]
        ):
            raise ValueError("The local tag does not match the release")
        return
    root = Path(run("git", "rev-parse", "--show-toplevel").stdout.strip())
    if args.command == "build":
        output = (args.output or root / "release" / args.tag).resolve()
        build(root, args.tag, args.image, output)
    else:
        publish(root, args.directory.resolve())


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    try:
        main()
    except (
        OSError,
        ValueError,
        KeyError,
        IndexError,
        struct.error,
        tarfile.TarError,
        subprocess.CalledProcessError,
        RuntimeError,
    ) as error:
        print(f"release: {error}", file=sys.stderr)
        if isinstance(error, subprocess.CalledProcessError) and error.stderr:
            print(error.stderr, file=sys.stderr)
        sys.exit(1)
