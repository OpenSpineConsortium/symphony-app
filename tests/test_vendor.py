"""app/vendor/sdlc_protocol is a partial copy of the claim protocol's
library, OpenSpineConsortium/symphony-protocol, holding at least
protocol_check.py, whose problems_for the handler turns into the check run
sdlc/protocol, claims.py, which the handler imports too, and vendoring.py,
the copy's own check. The library's scripts/vendor.py makes the copy, and
its sync workflow lands each new one here as the pull request
symphony-protocol/sync; app/vendor/VENDORED records it, the version and the
commit on its first line and then the sha256 of every copied file.
scripts/check.sh holds the copy to that record with the copy's own
vendoring.py before any test runs.

Which files the copy holds beyond those is the library's ecosystem.json to
say, never a list here: the sync brings the new copy and its new record in
one pull request, so a second list on this repository's main would fail
that pull request whenever the library changed what the App takes, and
could not be changed first either, since main's copy is still the old one.
The exact set is held by verify, which compares the copy with its record,
and by the comparison with ecosystem.json at the recorded commit.

These tests hold the record to a release and a whole commit and to the
copy's files, the copy to the library itself where a clone of it is at
hand, and the App to running the copy. tests/test_handlers.py holds the
copy to the behaviour the App relies on, so a sync that changes it fails
there.

The record sits in this tree beside the copy, so a pull request that
edits the copy can rewrite the file's line in VENDORED too, and verify
passes; the comparison with the library is what fails it. It reads the
clone SDLC_PROTOCOL names, which this repository's CI makes and names
(.github/workflows/ci.yml), and fails there when the clone is missing or
has no commit of the one VENDORED names, so a made-up commit does not
pass as skipped. With SDLC_PROTOCOL unset it reads a clone beside this
repository, under the library's name or its old one, as the clones sit
on a developer's machine and in the library's downstream job, and skips
when there is none or when it is behind."""

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


def clone_beside():
    """The library's clone beside this repository, under its name or, since
    a clone made before the rename to Symphony keeps its folder, the old one."""
    named = [ROOT.parent / "symphony-protocol", ROOT.parent / "sdlc-protocol"]
    return next((path for path in named if (path / ".git").exists()), named[0])


LIBRARY = Path(os.environ.get("SDLC_PROTOCOL") or clone_beside())
# A clone named on purpose, as CI names its own, is one the comparison must
# have; a clone that only happens to sit beside this one may be absent or
# behind, and then the comparison is skipped.
LIBRARY_NAMED = bool(os.environ.get("SDLC_PROTOCOL"))
CI = ROOT / ".github" / "workflows" / "ci.yml"
CLONE = 'git clone --quiet https://github.com/OpenSpineConsortium/symphony-protocol "$RUNNER_TEMP/symphony-protocol"'
NAMED_IN_CI = "SDLC_PROTOCOL: ${{ runner.temp }}/symphony-protocol"
COMPARISON = "tests.test_vendor.TheCopyIsTheLibrarysTest.test_every_file_is_the_librarys_at_the_recorded_commit"
# Either name of this repository: the library's ecosystem.json at the recorded
# commit predates the rename to Symphony and knows it by the old one.
THIS_REPOSITORY = {"OpenSpineConsortium/symphony-app", "OpenSpineConsortium/sdlc-app"}
# What the App itself runs from the copy: the two modules app/handlers.py
# imports and the check scripts/check.sh runs.
NEEDED = {"claims.py", "protocol_check.py", "vendoring.py"}
# A whole line of scripts/check.sh and the start of another, matched
# against its stripped lines, so a line commented out there does not
# count as run.
VERIFY = '"$PYTHON" app/vendor/sdlc_protocol/vendoring.py verify app/vendor'
TESTS = '"$PYTHON" -m unittest '

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


def recorded_paths():
    return [path for path, _ in recorded_digests()]


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


def why_the_library_cannot_compare(commit):
    """What stands in the way of comparing the copy with the library at
    commit, or "" when nothing does."""
    if not (LIBRARY / ".git").exists():
        return f"no clone of symphony-protocol at {LIBRARY}"
    if library("cat-file", "-e", f"{commit}^{{commit}}").returncode != 0:
        return (f"the clone at {LIBRARY} does not have {commit}, the commit VENDORED names: "
                "vendor a commit of symphony-protocol's, never write one into the record by hand")
    return ""


def ci_steps():
    """The steps of ci.yml's one job, each as its lines with the indent
    stripped. The workflow is read as text, the standard library having no
    YAML parser; each step starts with a dash six spaces in."""
    steps = CI.read_text(encoding="utf-8").split("\n    steps:\n", 1)[1]
    return [[line.strip() for line in step.splitlines()] for step in re.split(r"\n(?=      - )", steps)]


def without_git_variables():
    """The environment without git's own variables, which would point a
    git the tests start at another repository than the one they name."""
    return {name: value for name, value in os.environ.items() if not name.startswith("GIT_")}


def compare_with(clone):
    """The comparison with the library run on its own, in a process of its
    own, with SDLC_PROTOCOL naming clone, as CI names its own; run from the
    root, as scripts/check.sh runs the tests, so app imports."""
    env = dict(without_git_variables(), SDLC_PROTOCOL=str(clone))
    return subprocess.run([sys.executable, "-B", "-m", "unittest", COMPARISON],
                          cwd=ROOT, env=env, capture_output=True, text=True)


def module_file(function):
    return Path(sys.modules[function.__module__].__file__).resolve()


def files_the_library_names(ecosystem, consumer, commit):
    """The files ecosystem.json has the consumer take, as the library's
    vendor.py chooses them: every file of the package at that commit for
    "all", else the consumer's modules and the files every copy takes."""
    if consumer["modules"] == "all":
        listed = library("ls-tree", "-r", "--name-only", commit, "--", "sdlc_protocol/")
        return sorted(name.removeprefix("sdlc_protocol/") for name in listed.stdout.decode("ascii").splitlines())
    return sorted(set(consumer["modules"]) | set(ecosystem["always_copied"]))


class TheRecordTest(unittest.TestCase):
    def test_the_record_names_a_release_and_the_copy_is_that_release(self):
        version, _ = recorded_release()
        self.assertEqual(app.vendor.sdlc_protocol.__version__, version)

    def test_the_record_lists_every_file_of_the_copy_each_with_its_sha256(self):
        listed = recorded_digests()
        self.assertTrue(listed, "VENDORED lists no files: it is the old record of one line; re-vendor")
        self.assertEqual(recorded_paths(), sorted(recorded_paths()), "VENDORED lists its files sorted by path")
        self.assertEqual(recorded_paths(), package_files())
        for path, digest in listed:
            with self.subTest(file=path):
                self.assertEqual(hashlib.sha256((PACKAGE / path).read_bytes()).hexdigest(), digest,
                                 "change it in symphony-protocol and let the sync bring it, never the copy here")

    def test_the_record_holds_what_the_app_runs(self):
        self.assertLessEqual(NEEDED, set(recorded_paths()),
                             "the library's ecosystem.json must give the App the modules app/handlers.py imports")


class TheVerificationTest(unittest.TestCase):
    """scripts/check.sh holds the copy to its record before the tests run,
    so a pull request that edits app/vendor/sdlc_protocol and leaves the
    record as it was fails the required check, offline; one that rewrites
    the record to match fails the comparison with the library below. The
    library's own tests cover each problem the check can name."""

    def test_check_sh_verifies_the_copy_before_the_tests(self):
        lines = [line.strip() for line in (ROOT / "scripts" / "check.sh").read_text(encoding="ascii").splitlines()]
        self.assertIn(VERIFY, lines, "scripts/check.sh must run the copy's verify on a line of its own")
        testing = [number for number, line in enumerate(lines) if line.startswith(TESTS)]
        self.assertTrue(testing, "scripts/check.sh must run the tests with unittest")
        self.assertLess(lines.index(VERIFY), testing[0])

    def test_the_copy_matches_its_record(self):
        version, commit = recorded_release()
        done = verify(VENDOR)
        self.assertEqual(done.returncode, 0, done.stdout + done.stderr)
        self.assertEqual(done.stdout, f"vendored sdlc-protocol {version} at {commit[:7]}: "
                                      f"{len(recorded_paths())} files match VENDORED\n")

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
        missing = why_the_library_cannot_compare(commit)
        if missing and LIBRARY_NAMED:
            self.fail(f"{missing} (SDLC_PROTOCOL names it)")
        if missing:
            self.skipTest(missing)
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
        ours = [consumer for consumer in ecosystem["consumers"] if consumer["repository"] in THIS_REPOSITORY]
        self.assertEqual(len(ours), 1)
        self.assertEqual(ours[0]["vendor_dir"], "app/vendor")
        self.assertEqual(files_the_library_names(ecosystem, ours[0], commit), recorded_paths())


class TheComparisonOnCITest(unittest.TestCase):
    """CI clones symphony-protocol and names the clone to the checks, so the
    comparison with the library runs on every pull request; where the clone
    it names is missing, or has no commit of the one VENDORED names, the
    comparison fails rather than skips."""

    def test_ci_clones_the_library_and_names_the_clone_to_the_checks(self):
        steps = ci_steps()
        clone = next(number for number, step in enumerate(steps) if f"run: {CLONE}" in step)
        checks = next(number for number, step in enumerate(steps) if "run: bash scripts/check.sh" in step)
        self.assertLess(clone, checks)
        self.assertIn(NAMED_IN_CI, steps[checks])

    def test_a_named_clone_that_is_not_there_fails_the_comparison(self):
        with tempfile.TemporaryDirectory() as folder:
            done = compare_with(Path(folder) / "symphony-protocol")
        self.assertEqual(done.returncode, 1, done.stderr)
        self.assertIn("no clone of symphony-protocol at", done.stderr)
        self.assertNotIn("skipped", done.stderr)

    def test_a_named_clone_without_the_recorded_commit_fails_the_comparison(self):
        with tempfile.TemporaryDirectory() as folder:
            subprocess.run(["git", "init", "--quiet", folder], check=True, capture_output=True,
                           env=without_git_variables())
            done = compare_with(folder)
        self.assertEqual(done.returncode, 1, done.stderr)
        self.assertIn("the commit VENDORED names", done.stderr)
        self.assertNotIn("skipped", done.stderr)


class TheAppRunsTheCopyTest(unittest.TestCase):
    def test_the_handler_checks_with_the_vendored_protocol_check_and_claims(self):
        self.assertEqual(module_file(handlers.problems_for), PACKAGE / "protocol_check.py")
        self.assertEqual(module_file(handlers.claim_path), PACKAGE / "claims.py")


if __name__ == "__main__":
    unittest.main()
