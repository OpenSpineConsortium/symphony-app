"""The rules every file of the repository keeps, and the facts other
files promise: the manifest's permissions and events as README.md lists
them, and the vendored code unchanged from the copy vendor/README.md names."""

import hashlib
import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKIPPED_DIRECTORIES = {".git", "__pycache__"}
# The credentials are never committed, but a working copy may hold them.
SKIPPED_FILES = {".sdlc-app.env"}


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
        self.assertEqual(manifest["name"], "sdlc")
        self.assertEqual(manifest["url"], "https://github.com/OpenSpineConsortium/sdlc-template")
        self.assertFalse(manifest["public"])
        self.assertEqual(manifest["hook_attributes"], {"url": "https://example.invalid/webhook", "active": False})
        self.assertEqual(manifest["redirect_url"], "http://localhost:3010/registered")
        self.assertEqual(manifest["default_permissions"], {"contents": "write", "issues": "write",
                                                           "pull_requests": "write", "checks": "write",
                                                           "metadata": "read"})
        self.assertEqual(manifest["default_events"], ["issues", "issue_comment", "pull_request", "push",
                                                      "check_suite"])


class VendorTest(unittest.TestCase):
    def test_the_vendored_files_are_the_copies_the_readme_names(self):
        vendor = ROOT / "app" / "vendor"
        listed = dict(re.findall(r"`([a-z_]+\.py)`: ([0-9a-f]{64})", (vendor / "README.md").read_text()))
        self.assertEqual(set(listed), {"claims.py", "protocol_check.py"})
        for name, digest in listed.items():
            with self.subTest(file=name):
                data = (vendor / "sdlc_protocol" / name).read_bytes()
                self.assertEqual(hashlib.sha256(data).hexdigest(), digest,
                                 "edit sdlc-protocol and copy it in again, never the copy here")


if __name__ == "__main__":
    unittest.main()
