"""The rules every file of the repository keeps, and the facts other
files promise: the manifest's permissions and events as README.md lists
them. The vendored copy of symphony-protocol and its record app/vendor/VENDORED
are tests/test_vendor.py's."""

import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKIPPED_DIRECTORIES = {".git", "__pycache__"}
# The credentials are never committed, but a working copy may hold them.
SKIPPED_FILES = {".sdlc-app.env", ".sdlc-setup-app.env"}


def repository_files():
    for path in sorted(ROOT.rglob("*")):
        relative = path.relative_to(ROOT)
        if path.is_dir() or SKIPPED_DIRECTORIES & set(relative.parts):
            continue
        if path.name in SKIPPED_FILES or path.suffix in {".pem", ".pyc"}:
            continue
        yield relative, path.read_bytes()


class TextRulesTest(unittest.TestCase):
    def test_every_file_is_ascii_with_lf_and_ends_with_a_newline(self):
        for relative, data in repository_files():
            with self.subTest(file=str(relative)):
                data.decode("ascii")
                self.assertNotIn(b"\r", data)
                self.assertTrue(data.endswith(b"\n"), "no newline at the end")


class ManifestTest(unittest.TestCase):
    def test_the_manifest_asks_for_what_the_app_uses(self):
        manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["name"], "SymphonyBoard")
        self.assertEqual(manifest["url"], "https://openspineconsortium.com/symphony/")
        self.assertFalse(manifest["public"])
        self.assertEqual(manifest["hook_attributes"], {"url": "https://example.invalid/webhook", "active": False})
        self.assertEqual(manifest["redirect_url"], "http://localhost:3010/registered")
        self.assertEqual(manifest["default_permissions"], {"contents": "write", "issues": "write",
                                                           "pull_requests": "write", "checks": "write",
                                                           "metadata": "read"})
        self.assertEqual(manifest["default_events"], ["issues", "issue_comment", "pull_request", "push",
                                                      "check_suite"])


if __name__ == "__main__":
    unittest.main()
