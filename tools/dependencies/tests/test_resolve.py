"""Dependency updater contracts; no registry, container daemon or Radicle identity needed."""

import importlib.util
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location(
    "resolver", Path(__file__).resolve().parents[1] / "resolve.py"
)
resolver = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(resolver)


class ResolverTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "source"
        self.root.mkdir()
        generated = self.root / resolver.GENERATED
        generated.parent.mkdir(parents=True)
        generated.write_text('{"name":"generated"}\n')

    def test_every_ecosystem_is_updated_without_lifecycle_scripts(self):
        with patch.object(resolver, "run") as run:
            resolver.resolve(self.root)
        commands = [call.args[0] for call in run.call_args_list]
        self.assertEqual(commands[0], ["cargo", "update"])
        bun = [cmd for cmd in commands if cmd[0] == "bun"]
        self.assertEqual(len(bun), 3)
        for cmd in bun:
            self.assertIn("--ignore-scripts", cmd)
            self.assertIn("--lockfile-only", cmd)
            self.assertNotIn("--latest", cmd)
            self.assertIn("604800", cmd)
        uv = [cmd for cmd in commands if cmd[:2] == ["uv", "lock"]]
        self.assertEqual(len(uv), 5)
        self.assertTrue(all("--upgrade" in cmd for cmd in uv))
        self.assertEqual(sum("--script" in cmd for cmd in uv), 3)
        self.assertEqual(commands[-1][-2:], ["pre-commit", "autoupdate"])

    def test_generated_bindings_are_restored_and_lock_reconciled(self):
        generated = self.root / resolver.GENERATED
        before = generated.read_bytes()

        def change_generated(command, cwd):
            if command[:2] == ["bun", "update"]:
                generated.write_text("changed by workspace update")

        with patch.object(resolver, "run", side_effect=change_generated) as run:
            resolver.resolve(self.root)
        self.assertEqual(generated.read_bytes(), before)
        self.assertIn(
            ["bun", "install", "--ignore-scripts", "--lockfile-only"],
            [call.args[0] for call in run.call_args_list],
        )

    def test_failure_stops_the_run(self):
        with (
            patch.object(
                resolver, "run", side_effect=subprocess.CalledProcessError(1, "cargo")
            ) as run,
            self.assertRaises(subprocess.CalledProcessError),
        ):
            resolver.resolve(self.root)
        self.assertEqual(run.call_count, 1)

    def test_patch_includes_new_locks_but_not_unrelated_code(self):
        def git(*args):
            return subprocess.check_output(["git", *args], cwd=self.root)

        git("init", "--quiet")
        (self.root / "Cargo.lock").write_text("old\n")
        (self.root / "source.rs").write_text("original\n")
        git("add", ".")
        git(
            "-c",
            "user.name=Test",
            "-c",
            "user.email=test@localhost",
            "commit",
            "--quiet",
            "--no-verify",
            "-m",
            "baseline",
        )
        (self.root / "Cargo.lock").write_text("updated\n")
        (self.root / "source.rs").write_text("must not escape\n")
        (self.root / "tansu").mkdir()
        (self.root / "tansu/uv.lock").write_text("new lock\n")
        output = Path(self.temp.name) / "output"
        output.mkdir()
        resolver.export(self.root, output)
        diff = (output / "updates.patch").read_text()
        self.assertIn("Cargo.lock", diff)
        self.assertIn("tansu/uv.lock", diff)
        self.assertNotIn("source.rs", diff)
        self.assertNotIn(resolver.GENERATED, diff)
        # The exact artifact applies cleanly to its base, including an untracked lock.
        git("apply", "--reverse", "--check", str(output / "updates.patch"))


if __name__ == "__main__":
    unittest.main()
