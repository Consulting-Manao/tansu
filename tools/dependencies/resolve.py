"""Resolve compatible updates in an isolated snapshot and export only dependency files."""

import json
import os
import subprocess
import tarfile
from pathlib import Path

BUN_PROJECTS = ("dapp", "website", "dapp/workers/ipfs-delegation")
PYTHON_PROJECTS = ("tansu", "pre-commit")
PYTHON_SCRIPTS = ("check_conflicts.py", "export_ballots.py", "tally.py")
GENERATED = "dapp/packages/tansu/package.json"
FILES = (
    "Cargo.lock",
    ".pre-commit-config.yaml",
    *(
        f"{project}/{name}"
        for project in BUN_PROJECTS
        for name in ("package.json", "bun.lock")
    ),
    *(f"{project}/uv.lock" for project in PYTHON_PROJECTS),
    *(f"tools/{script}.lock" for script in PYTHON_SCRIPTS),
)


def run(command, cwd, **kwargs):
    print("+", " ".join(command), flush=True)
    return subprocess.run(command, cwd=cwd, check=True, timeout=1800, **kwargs)


def resolve(root):
    """Keep declared compatibility ranges, exact pins, patches and generated bindings."""
    run(["cargo", "update"], root)
    generated = (root / GENERATED).read_bytes()
    for project in BUN_PROJECTS:
        run(
            [
                "bun",
                "update",
                "--ignore-scripts",
                "--lockfile-only",
                "--minimum-release-age",
                "604800",
            ],
            root / project,
        )
    # The bindings are generated from WASM. Even a workspace-aware package manager
    # must not hand-edit their manifest; re-resolve against the original if needed.
    if (root / GENERATED).read_bytes() != generated:
        (root / GENERATED).write_bytes(generated)
        run(["bun", "install", "--ignore-scripts", "--lockfile-only"], root / "dapp")
    for project in PYTHON_PROJECTS:
        run(["uv", "lock", "--upgrade", "--exclude-newer", "7 days"], root / project)
    for script in PYTHON_SCRIPTS:
        run(
            [
                "uv",
                "lock",
                "--script",
                f"tools/{script}",
                "--upgrade",
                "--exclude-newer",
                "7 days",
            ],
            root,
        )
    # Refresh hook revisions, without installing or running the hooks (in particular,
    # never invoke the pre-push hook that records a commit on-chain).
    run(
        [
            "uv",
            "tool",
            "run",
            "--from",
            "pre-commit==4.7.0",
            "pre-commit",
            "autoupdate",
        ],
        root,
    )


def export(root, output):
    # Include newly created Python locks without staging a commit. Restrict the
    # exported patch to dependency files, even if a resolver changes something else.
    files = [name for name in FILES if (root / name).is_file()]
    run(["git", "add", "--intent-to-add", "--", *files], root)
    patch = subprocess.check_output(["git", "diff", "--binary", "--", *files], cwd=root)
    summary = subprocess.check_output(["git", "diff", "--stat", "--", *files], cwd=root)
    (output / "updates.patch").write_bytes(patch)
    (output / "summary.txt").write_bytes(
        summary or b"No compatible dependency updates.\n"
    )


def main():
    root = Path("/tmp/source")
    root.mkdir()
    Path(os.environ["HOME"]).mkdir(exist_ok=True)
    with tarfile.open("/input/source.tar") as archive:
        archive.extractall(root, filter="data")
    run(["git", "init", "--quiet"], root)
    run(["git", "add", "."], root)
    run(
        [
            "git",
            "-c",
            "user.name=Dependency resolver",
            "-c",
            "user.email=resolver@localhost",
            "commit",
            "--quiet",
            "--no-verify",
            "-m",
            "Snapshot",
        ],
        root,
    )
    resolve(root)
    export(root, Path("/output"))
    # Record compatibility holds explicitly, rather than calling them "up to date".
    report = {
        "policy": "latest within declared ranges; exact pins and patched packages retained",
        "typescript": json.loads((root / "dapp/package.json").read_text())[
            "devDependencies"
        ]["typescript"],
        "generated_bindings": "unchanged",
        "validation": "not run: apply and review the patch, then run make dependency_checks",
        "cooldown": "7 days for Bun and uv; Cargo has no equivalent stable option",
    }
    (Path("/output") / "policy.json").write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    main()
