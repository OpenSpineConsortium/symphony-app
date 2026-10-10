"""app/vendor/sdlc_protocol is a copy of two modules of the claim protocol's
library, OpenSpineConsortium/sdlc-protocol: protocol_check.py, whose
problems_for the handler turns into the check run sdlc/protocol, and
claims.py, which it imports, with the package's __init__.py and
vendoring.py, which every copy takes. The library's scripts/vendor.py makes
the copy, and its sync workflow lands each new one here as the pull
request sdlc-protocol/sync; app/vendor/VENDORED records it, the version and
the commit on its first line and then the sha256 of every copied file.
scripts/check.sh holds the copy to that record with the copy's own
vendoring.py before any test runs.

These tests hold the record to a release and a whole commit and to the
files it lists, the copy to the library itself where a clone of it is at
hand, and the App to running the copy. tests/test_handlers.py holds the
copy to the behaviour the App relies on, so a sync that changes it fails
there.

The comparison with the library reads a clone of it beside this
repository, as the clones sit on a developer's machine and in the
library's downstream job, or the one SDLC_PROTOCOL names, and skips when
there is none, as on this repository's own CI."""

import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import app.vendor.sdlc_protocol
from app import handlers

ROOT = Path(__file__).resolve().parent.parent
VENDOR = ROOT / "app" / "vendor"
VENDORED = VENDOR / "VENDORED"
PACKAGE = VENDOR / "sdlc_protocol"
LIBRARY = Path(os.environ.get("SDLC_PROTOCOL") or ROOT.parent / "sdlc-protocol")
THIS_REPOSITORY = "OpenSpineConsortium/sdlc-app"
# The two modules the handler needs, and the two files every copy takes.
TAKEN = ["__init__.py", "claims.py", "protocol_check.py", "vendoring.py"]
VERIFY = "app/vendor/sdlc_protocol/vendoring.py verify app/vendor"

# Read here with patterns of this repository's own rather than with the
# copy's vendoring.py, so the copy is not the only judge of itself.
FIRST_LINE = re.compile(r"sdlc-protocol ([0-9]+\.[0-9]+\.[0-9]+) ([0-9a-f]{40})")
DIGEST_LINE = re.compile(r"([0-9a-f]{64})  (\S+)")


def record_lines():
    return VENDORED.read_text(encoding="ascii").splitlines()


def recorded_release():
    """The version and the commit the record's first line names."""
    first = (record_lines() or [""])[0]
    found = FIRST_LINE.fullmatch(first)
    if not found:
        raise AssertionError(f"VENDORED's first line does not name a release and a whole commit: {first!r}")
    return found.groups()


def recorded_digests():
    """The record's lines after the first, as (path, sha256) in their order."""
    found = []
    for line in record_lines()[1:]:
        digest = DIGEST_LINE.fullmatch(line)
        if not digest:
            raise AssertionError(f"{VENDORED} has a line that is not '<sha256>  <path>': {line!r}")
        found.append((digest.group(2), digest.group(1)))
    return found


def package_files():
    """The copy's files, relative to it, without Python's caches, which
    running the tests writes there and git ignores."""
    return sorted(path.relative_to(PACKAGE).as_posix() for path in PACKAGE.rglob("*")
                  if path.is_file() and "__pycache__" not in path.parts and path.suffix != ".pyc")


def verify(vendor_dir):
    """The copy's own check, run by its path as scripts/check.sh runs it;
    -B keeps Python's caches out of the tree."""
    script = Path(vendor_dir) / "sdlc_protocol" / "vendoring.py"
    return subprocess.run([sys.executable, "-B", str(script), "verify", str(vendor_dir)],
                          capture_output=True, text=True)


def library(*args):
    return subprocess.run(["git", "-C", str(LIBRARY), *args], capture_output=True)


def module_file(function):
    return Path(sys.modules[function.__module__].__file__).resolve()


class TheRecordTest(unittest.TestCase):
    def test_the_record_names_a_release_and_the_copy_is_that_release(self):
        version, _ = recorded_release()
        self.assertEqual(app.vendor.sdlc_protocol.__version__, version)

    def test_the_record_lists_the_files_the_app_takes_each_with_its_sha256(self):
        listed = recorded_digests()
        self.assertTrue(listed, "VENDORED lists no files: it is the old record of one line; re-vendor")
        self.assertEqual([path for path, _ in listed], TAKEN)
        self.assertEqual(package_files(), TAKEN)
        for path, digest in listed:
            with self.subTest(file=path):
                self.assertEqual(hashlib.sha256((PACKAGE / path).read_bytes()).hexdigest(), digest,
                                 "change it in sdlc-protocol and let the sync bring it, never the copy here")


class TheVerificationTest(unittest.TestCase):
    """scripts/check.sh holds the copy to its record before the tests run,
    so a pull request that edits app/vendor/sdlc_protocol by hand fails
    the required check, offline; the library's own tests cover each
    problem the check can name."""

    def test_check_sh_verifies_the_copy_before_the_tests(self):
        lines = [line.strip() for line in (ROOT / "scripts" / "check.sh").read_text(encoding="ascii").splitlines()]
        verifying = next(number for number, line in enumerate(lines) if line.endswith(VERIFY))
        testing = next(number for number, line in enumerate(lines) if "-m unittest" in line)
        self.assertLess(verifying, testing)

    def test_the_copy_matches_its_record(self):
        version, commit = recorded_release()
        done = verify(VENDOR)
        self.assertEqual(done.returncode, 0, done.stdout + done.stderr)
        self.assertEqual(done.stdout, f"vendored sdlc-protocol {version} at {commit[:7]}: "
                                      f"{len(TAKEN)} files match VENDORED\n")

    def test_a_hand_edit_of_the_copy_fails(self):
        with tempfile.TemporaryDirectory() as folder:
            copy = Path(folder) / "vendor"
            shutil.copytree(VENDOR, copy, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
            with open(copy / "sdlc_protocol" / "protocol_check.py", "a", encoding="ascii", newline="\n") as edited:
                edited.write("# a local fix\n")
            done = verify(copy)
        self.assertEqual(done.returncode, 1, done.stdout + done.stderr)
        self.assertIn("protocol_check.py was edited by hand", done.stdout)


class TheCopyIsTheLibrarysTest(unittest.TestCase):
    def recorded_commit_in_the_library(self):
        _, commit = recorded_release()
        if not (LIBRARY / ".git").exists():
            self.skipTest(f"no clone of sdlc-protocol at {LIBRARY}")
        if library("cat-file", "-e", f"{commit}^{{commit}}").returncode != 0:
            self.skipTest(f"the clone at {LIBRARY} does not have {commit}")
        return commit

    def test_every_file_is_the_librarys_at_the_recorded_commit(self):
        commit = self.recorded_commit_in_the_library()
        for name in package_files():
            with self.subTest(file=name):
                theirs = library("show", f"{commit}:sdlc_protocol/{name}")
                self.assertEqual(theirs.returncode, 0, theirs.stderr)
                self.assertEqual((PACKAGE / name).read_bytes(), theirs.stdout)

    def test_the_librarys_ecosystem_names_these_files_for_this_repository(self):
        commit = self.recorded_commit_in_the_library()
        shown = library("show", f"{commit}:ecosystem.json")
        if shown.returncode != 0:
            self.skipTest(f"the library at {commit} has no ecosystem.json")
        ecosystem = json.loads(shown.stdout)
        ours = [consumer for consumer in ecosystem["consumers"] if consumer["repository"] == THIS_REPOSITORY]
        self.assertEqual(len(ours), 1)
        self.assertEqual(ours[0]["vendor_dir"], "app/vendor")
        self.assertEqual(sorted(set(ours[0]["modules"]) | set(ecosystem["always_copied"])), TAKEN)


class TheAppRunsTheCopyTest(unittest.TestCase):
    def test_the_handler_checks_with_the_vendored_protocol_check_and_claims(self):
        self.assertEqual(module_file(handlers.problems_for), PACKAGE / "protocol_check.py")
        self.assertEqual(module_file(handlers.claim_path), PACKAGE / "claims.py")


if __name__ == "__main__":
    unittest.main()
