"""Exercise the real shell wrapper with a stand-in container engine."""

import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path


@unittest.skipIf(os.name == "nt", "the container wrapper targets a Unix container host")
class ContainerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        scripts = self.root / "tools/dependencies"
        scripts.mkdir(parents=True)
        shutil.copy(Path(__file__).resolve().parents[1] / "update.sh", scripts)
        (self.root / "tracked.txt").write_text("baseline")
        (self.root / ".env").write_text("untracked credentials")
        (self.root / ".gitignore").write_text(
            ".env\ndependency-update-*/\nengine\ncommands.jsonl\n"
        )
        for args in [
            ["init", "--quiet"],
            ["add", "."],
            [
                "-c",
                "user.name=Test",
                "-c",
                "user.email=test@localhost",
                "commit",
                "--quiet",
                "--no-verify",
                "-m",
                "baseline",
            ],
        ]:
            subprocess.run(["git", *args], cwd=self.root, check=True)
        self.engine = self.root / "engine"
        self.engine.write_text("""#!/usr/bin/env python3
import json, os, sys, tarfile
from pathlib import Path
with open(os.environ["COMMAND_LOG"], "a") as log:
    log.write(json.dumps(sys.argv[1:]) + "\\n")
if sys.argv[1] == "run":
    mount = next(arg for arg in sys.argv if "target=/input," in arg)
    source = mount.split("source=", 1)[1].split(",", 1)[0]
    with tarfile.open(Path(source) / "source.tar") as archive:
        names = archive.getnames()
        assert ".git" not in names and ".env" not in names
    sys.exit(int(os.environ.get("ENGINE_FAILURE", "0")))
""")
        self.engine.chmod(0o755)
        self.log = self.root / "commands.jsonl"
        self.env = dict(
            os.environ, DEPENDENCY_ENGINE=str(self.engine), COMMAND_LOG=str(self.log)
        )

    def invoke(self):
        return subprocess.run(
            ["bash", "tools/dependencies/update.sh"],
            cwd=self.root,
            env=self.env,
            check=False,
            capture_output=True,
            text=True,
        )

    def test_clean_snapshot_has_no_host_credentials_and_restricted_mounts(self):
        result = self.invoke()
        self.assertEqual(result.returncode, 0, result.stderr)
        commands = [json.loads(line) for line in self.log.read_text().splitlines()]
        self.assertEqual(commands[0][0], "build")
        args = commands[1]
        self.assertIn("--read-only", args)
        self.assertIn("--cap-drop=ALL", args)
        self.assertIn("--security-opt=no-new-privileges", args)
        self.assertEqual(args.count("--mount"), 2)
        self.assertFalse(
            any("docker.sock" in arg or "ssh-agent" in arg for arg in args)
        )
        self.assertEqual(len(list(self.root.glob("dependency-update-*/base.txt"))), 1)
        self.assertEqual((self.root / "tracked.txt").read_text(), "baseline")

    def test_dirty_tree_is_refused_before_engine_runs(self):
        (self.root / "tracked.txt").write_text("unreviewed")
        self.assertNotEqual(self.invoke().returncode, 0)
        self.assertFalse(self.log.exists())

    def test_untracked_source_is_refused_before_engine_runs(self):
        (self.root / "unreviewed.py").write_text("print('unreviewed')")
        self.assertNotEqual(self.invoke().returncode, 0)
        self.assertFalse(self.log.exists())

    def test_container_failure_never_claims_success(self):
        self.env["ENGINE_FAILURE"] = "17"
        result = self.invoke()
        self.assertEqual(result.returncode, 17)
        self.assertFalse(list(self.root.glob("dependency-update-*/base.txt")))
        self.assertNotIn("nothing was committed", result.stdout)


if __name__ == "__main__":
    unittest.main()
