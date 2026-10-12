#!/usr/bin/env python3
"""Collect the field metrics that projects using the App choose to share.

A project made from symphony-template, or adopted into it, writes two small
files to its branch `metrics` with its own workflow: METRICS.json, the
claim protocol's counts, durations and rates over the last thirty days,
in all, by work setting and in pairs of pull requests at work at the same
time, with what the work cost in tokens and estimated dollars, set beside
work done alone and in parallel, and, when a contributor runs the judge
on their own machine,
JUDGE.json, the number of each kind of communication failure the judge
found, in all and by work setting. Both are aggregates by design, and the
lists below are their format: the keys each file may hold and what kind
of value each key takes. This script holds every file it reads to them.

With the App's JWT this lists the App's installations, mints a token for
each that can read contents and nothing else, lists the repositories it
can see, and asks each for those two paths at the ref `metrics`, and for
no other path: a 404 there means the project has nothing to collect. A
fork is skipped unread, since its branch `metrics` is a copy of its
upstream's, frozen on the day of the fork, which would put one project's
numbers in the dataset twice; an archived repository is skipped too, its
files frozen as well. A METRICS.json is kept only when its "sharing" is
exactly "on"; when it is anything else the project's JUDGE.json is not
even read. What is kept is cut to the keys the format names, and a value
where it says a count, a duration or a rate is kept only when it is such
a number, so no text a project writes, whether by mistake or on purpose,
reaches the dataset. The strings it allows besides numbers, the model's
name and the prompt variant, must look like identifiers, the date of the
template's price table like a date, and a time is rewritten in one form
of the collector's own. The names of the work settings, of the kinds of
pairs, of the model families and of the two sides are fixed words of the
template's, from the lists below, never a project's.

The repository is never named in the dataset. It becomes the HMAC-SHA256
of its node id under a salt only the collector holds, so a line can be
followed from day to day but not traced back to a repository by anyone
without the salt. The salt is derived from the App's private key, the
secret the collector has already: HMAC-SHA256 of the PEM under the fixed
label "sdlc-metrics-salt", which is the extract step of HKDF (RFC 5869),
so nothing of the key can be recovered from a hash and the same key
always gives the same salt, in whichever form the key arrives. It is the
PEM's text that is hashed, so a key re-encoded, say from the PKCS#1 form
GitHub downloads to PKCS#8, counts as a new one. The owner sets no second
secret for it; SDLC_METRICS_SALT, when set, is used instead. Rotating the
key, or setting or changing the override, gives every repository a new
hash, and the lines before and after cannot be joined. No repository
name, owner, login, installation id or URL is written to the dataset or
to the log, whose lines say counts only; an error on one repository is
counted, not shown, since GitHub's message would carry the repository's
path.

Each kept file becomes one JSON line, {"repo": <hash>, "collected_at":
<the UTC date>, ...the file as kept...}, in metrics.jsonl or judge.jsonl
under --out. A repository has one line a day: a second run on the same
day replaces that line instead of adding one, so the file changes only
when what the projects share did.

    SDLC_APP_ID=... SDLC_APP_PRIVATE_KEY=... python3 scripts/collect.py --out data
    python3 scripts/collect.py --env-file .sdlc-app.env --dry-run

The workflow .github/workflows/collect.yml runs it once a day and commits
what changed to this repository's branch `data`.
"""

import argparse
import base64
import hashlib
import hmac
import http.client
import json
import math
import os
import re
import sys
import tempfile
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
# scripts/ is no package; the repository root on the path makes app importable.
sys.path.insert(0, str(ROOT))

from app import envfile
from app.github import API, Api, Client, GitHubError, InstallationTokens, urllib_transport
from app.jwt import APP_ID_VARIABLE, AppKey, SigningError, app_jwt, pem_text

SALT_VARIABLE = "SDLC_METRICS_SALT"
# The label the salt is derived from the App's key under. Changing it
# would change every hash, like rotating the key.
SALT_LABEL = b"sdlc-metrics-salt"
# Below this an override could be found by trying salts; the derived salt
# is 64 hex digits.
SALT_MINIMUM = 32
METRICS_REF = "metrics"
METRICS_FILE = "METRICS.json"
JUDGE_FILE = "JUDGE.json"
METRICS_LINES = "metrics.jsonl"
JUDGE_LINES = "judge.jsonl"
METRICS_SCHEMA = "sdlc-metrics/1"
JUDGE_SCHEMA = "sdlc-judge/1"
# Both files are a few kilobytes at most, the breakdown by work setting
# included; anything far larger is not one.
MAX_FILE_BYTES = 64 * 1024
# Read access to contents is all the collector needs of an installation.
READ_ONLY = {"contents": "read", "metadata": "read"}
# What can go wrong reading one installation or repository: GitHub's
# refusal, the network, or a reply that is not JSON. Each is counted and
# the run goes on with the next.
READ_ERRORS = (GitHubError, OSError, http.client.HTTPException, ValueError)

COUNTS = ("claims", "pull_requests_opened", "merged", "closed_unmerged", "reviews", "changes_requested",
          "check_runs_passed", "check_runs_failed", "conflicts_seen", "released_claims", "contributors")
DURATIONS = ("claim_to_first_pull_request", "open_to_merge", "first_review")
STATISTICS = ("median", "p90")
RATES = ("merge_rate", "first_check_pass_rate")
# The seven codes of the CooperBench paper's App F and its three groups.
CATEGORIES = ("C1a", "C1b", "C2", "C3a", "C3b", "C4a", "C4b")
GROUPS = ("unresponsiveness", "hallucination", "repetition")
# The template's breakdown of the same pull requests: the work settings it
# sorts them into and the counts it keeps for each, the kinds of pairs of
# pull requests at work at the same time and the counts it keeps for each,
# and its counts of the parallel work as a whole (tools/metrics.py's
# SETTINGS, SETTING_KEYS, RELATIONS, PAIR_KEYS and PARALLEL_KEYS, in their
# order). They are words the format fixes, so a setting or a kind of pair
# a file names besides them is left out like any other key.
SETTINGS = ("solo", "one_session", "one_person_sessions", "several_people", "several_people_and_sessions",
            "undetermined", "workflow_agents", "automation")
SETTING_COUNTS = ("pull_requests", "merged", "closed_unmerged", "open", "conflicted", "released", "changes_requested",
                  "claim_branches", "partners", "work_seconds", "landings_under", "landings_before_opening",
                  "file_overlap")
RELATIONS = ("same_session", "one_person_sessions", "several_people", "undetermined")
PAIR_COUNTS = ("pairs", "both_active", "file_overlap", "landings", "landings_file_overlap", "conflict_onsets",
               "conflict_onsets_file_overlap")
PARALLEL_COUNTS = ("people", "sessions", "sessions_per_person_max", "pull_requests_with_session",
                   "pull_requests_without_session", "pull_requests_multi_session", "sessions_across_people",
                   "peak_parallel", "peak_parallel_people", "peak_sessions_one_person", "conflict_marks",
                   "conflict_marks_unattributed", "open_conflicting", "open_conflicting_drafts",
                   "open_conflicting_dirty", "truncated", "files_unread")
# What the work cost, as the template sums it (tools/economics.py's
# FAMILIES, GROUP_KEYS and RATIO_KEYS, in their order): token counts by
# model family, whose names the format fixes like the settings', the two
# sides of work done alone and in parallel, and the ratios between them.
FAMILIES = ("fable", "opus", "sonnet", "haiku", "other")
SIDES = ("alone", "parallel")
RATIOS = ("tokens_per_merge", "usd_per_merge", "latency", "throughput", "first_check_pass", "commits_per_merge",
          "failures_per_pull_request")
# The largest whole number a JSON reader's double holds exactly along
# with every one below it (JavaScript's Number.MAX_SAFE_INTEGER). A count
# is a number of pull requests, comments or seconds, and a duration one of
# seconds, some 285 million years at this bound; a larger number is
# neither, and its digits could carry text.
MAX_COUNT = 2 ** 53 - 1

# The vendored protocol's release and, as the template writes it from
# tools/VENDORED's first line, its short commit: "0.2.0 f530a66".
VERSION = re.compile(r"[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,4}( [0-9a-f]{7,40})?")
# The date of the template's price table, as economics' prices_as_of says it.
DATE = re.compile(r"20[0-9]{2}-[01][0-9]-[0-3][0-9]")
IDENTIFIER = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}(\[[a-z0-9]{1,8}\])?")


class Dropped(Exception):
    """A file left out of the dataset. The reason is a key of the tally,
    never anything the file said."""

    def __init__(self, reason):
        super().__init__(reason)
        self.reason = reason


def is_number(value):
    """An int or a finite float; Python's bool is an int, but no count.
    An int too large for a float is none either: JSON allows one of
    hundreds of digits, and math.isfinite raises on it instead of
    answering, which would stop the whole run on one project's file."""
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        return False
    try:
        return math.isfinite(value)
    except OverflowError:
        return False


def count(value):
    """A whole number, from zero to MAX_COUNT."""
    if isinstance(value, float) and math.isfinite(value) and value.is_integer():
        value = int(value)
    return value if isinstance(value, int) and not isinstance(value, bool) and 0 <= value <= MAX_COUNT else None


def duration(value):
    """Seconds, from zero to MAX_COUNT, which bounds a duration's digits
    as it bounds a count's."""
    return value if is_number(value) and 0 <= value <= MAX_COUNT else None


def rate(value):
    """A fraction from 0 to 1."""
    return value if is_number(value) and 0 <= value <= 1 else None


def amount(value):
    """A number from zero up, whole or not, such as dollars, a rate per
    merge or a ratio, bounded as a duration is."""
    return value if is_number(value) and 0 <= value <= MAX_COUNT else None


def timestamp(value):
    """An ISO 8601 time, written again in UTC in one form, so the text
    that reaches the dataset is the collector's own and not the file's.
    A time without a zone is taken to be UTC, as the format has it."""
    if not isinstance(value, str) or len(value) > 40:
        return None
    try:
        moment = datetime.fromisoformat(value)
        if moment.tzinfo is None:
            moment = moment.replace(tzinfo=timezone.utc)
        return moment.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    except (ValueError, OverflowError):
        return None


def matching(pattern):
    def clean(value):
        return value if isinstance(value, str) and pattern.fullmatch(value) else None
    return clean


def exactly(expected):
    def clean(value):
        return value if isinstance(value, str) and value == expected else None
    return clean


def kept(document, fields):
    """The keys of document that fields names, each as its cleaner leaves
    it, in the order of fields; a key the cleaner refuses is left out."""
    cleaned = {}
    for key, clean in fields.items():
        value = clean(document[key]) if key in document else None
        if value is not None:
            cleaned[key] = value
    return cleaned


def section(names, clean):
    """A cleaner for an object of named numbers, such as counts."""
    def clean_section(value):
        return kept(value, dict.fromkeys(names, clean)) if isinstance(value, dict) else None
    return clean_section


def strata(names, fields):
    """A cleaner for an object of named objects, such as by_setting: each
    name the format knows is cut by fields as kept() cuts a file, and a
    name it does not know, or one whose object keeps nothing but empty
    objects (a judge's counts of codes the format does not know), is left
    out, so a line never shows a setting that holds nothing."""
    def clean_strata(value):
        if not isinstance(value, dict):
            return None
        cleaned = {}
        for name in names:
            given = value.get(name)
            kept_one = kept(given, fields) if isinstance(given, dict) else {}
            if any(part != {} for part in kept_one.values()):
                cleaned[name] = kept_one
        return cleaned
    return clean_strata


def durations(value):
    """Each measure's median and p90, whether the file nests them
    ({"open_to_merge": {"median": s, "p90": s}}) or writes them flat
    ({"open_to_merge_median": s}); the format names the statistics but
    not their shape, so both shapes are read and the nested one written."""
    if not isinstance(value, dict):
        return None
    cleaned = {}
    for measure in DURATIONS:
        given = value.get(measure)
        if not isinstance(given, dict):
            given = {name: value[f"{measure}_{name}"] for name in STATISTICS if f"{measure}_{name}" in value}
        statistics = kept(given, dict.fromkeys(STATISTICS, duration))
        if statistics:
            cleaned[measure] = statistics
    return cleaned


# economics: the window's bill and what it delivered. The counts are of
# pull requests, sessions, runs, tokens, seconds and commits; the amounts
# are the estimated dollars and the rates per merge. actions_runs_unread
# is null when the records could not be listed, and then left out.
ECONOMICS_FIELDS = {
    "prices_as_of": matching(DATE),
    **dict.fromkeys(("pull_requests", "pull_requests_measured", "merged", "sessions", "actions_runs",
                     "actions_runs_unread", "tokens_input", "tokens_cache_write", "tokens_cache_read",
                     "tokens_output", "tokens_total", "tokens_unpriced"), count),
    "estimated_usd": amount,
    "coordinator_usd": amount,
    **dict.fromkeys(("claude_seconds", "commits", "check_failures", "reverts"), count),
    "tokens_by_family": section(FAMILIES, count),
    **dict.fromkeys(("tokens_per_merge", "usd_per_merge", "claude_seconds_per_merge", "commits_per_merge"), amount),
}

# One side of coordination, work done alone or in parallel.
SIDE_FIELDS = {
    **dict.fromkeys(("pull_requests", "merged", "measured", "measured_merged", "tokens"), count),
    "estimated_usd": amount,
    **dict.fromkeys(("claude_seconds", "commits", "check_failures", "first_check_passed", "first_check_counted"),
                    count),
    "open_to_merge_median": duration,
    "active_seconds": count,
}


def economics(value):
    return kept(value, ECONOMICS_FIELDS) if isinstance(value, dict) else None


def coordination(value):
    """The two sides, each cut as a work setting is, and the ratios, each a
    number from zero up and null where a side has nothing to divide."""
    if not isinstance(value, dict):
        return None
    cleaned = strata(SIDES, SIDE_FIELDS)(value)
    ratios = section(RATIOS, amount)(value.get("ratios"))
    if ratios:
        cleaned["ratios"] = ratios
    return cleaned


METRICS_FIELDS = {
    "schema": exactly(METRICS_SCHEMA),
    "generated_at": timestamp,
    "window_days": count,
    "sharing": exactly("on"),
    "protocol_version": matching(VERSION),
    "counts": section(COUNTS, count),
    "durations_seconds": durations,
    "rates": section(RATES, rate),
    "parallel": section(PARALLEL_COUNTS, count),
    # The counts that need the changed files are null in the template's
    # file when the board's reserve left those files unread; count(None)
    # is None, so they are left out then, never kept as zeros.
    "by_setting": strata(SETTINGS, dict.fromkeys(SETTING_COUNTS, count)),
    "pairs": strata(RELATIONS, dict.fromkeys(PAIR_COUNTS, count)),
    "economics": economics,
    "coordination": coordination,
}

# What the judge counts for each work setting: its pull requests that
# ended in the window, their judged conversations, those with two or more
# people, and the codes.
JUDGE_SETTING_FIELDS = {
    "pull_requests": count,
    "conversations": count,
    "multi_speaker": count,
    "counts": section(CATEGORIES, count),
}

JUDGE_FIELDS = {
    "schema": exactly(JUDGE_SCHEMA),
    "generated_at": timestamp,
    "model": matching(IDENTIFIER),
    "prompt_variant": matching(IDENTIFIER),
    "conversations": count,
    "counts": section(CATEGORIES, count),
    "groups": section(GROUPS, count),
    "window_days": count,
    # Null when the judge ran without a limit or under one that cut
    # nothing, and then left out: a line holds limit only when its run
    # judged just the newest pull requests.
    "limit": count,
    "multi_speaker": count,
    "by_setting": strata(SETTINGS, JUDGE_SETTING_FIELDS),
}


def shared_metrics(document):
    """A METRICS.json as the dataset keeps it. The switch is read before
    anything else is kept: "sharing" must be exactly "on"."""
    if not isinstance(document, dict) or document.get("schema") != METRICS_SCHEMA:
        raise Dropped("refused")
    if document.get("sharing") != "on":
        raise Dropped("not_shared")
    return kept(document, METRICS_FIELDS)


def shared_judge(document):
    """A JUDGE.json as the dataset keeps it: counts, its time, the
    model's name and two identifier words, and no text."""
    if not isinstance(document, dict) or document.get("schema") != JUDGE_SCHEMA:
        raise Dropped("refused")
    return kept(document, JUDGE_FIELDS)


def read_document(client, full_name, name):
    """The JSON of one of the two files at the ref metrics, or None when
    GitHub has none there: no branch metrics, or no such file on it. The
    path is one of two constants, so nothing else is ever asked for."""
    if name not in (METRICS_FILE, JUDGE_FILE):
        # Not one of READ_ERRORS, so a mistake here stops the run rather
        # than being counted as a repository that could not be read.
        raise RuntimeError(f"the collector reads {METRICS_FILE} and {JUDGE_FILE} only")
    found = client.request("GET", f"/repos/{full_name}/contents/{name}", params={"ref": METRICS_REF},
                           allow=(404,))
    if found is None:
        return None
    if not isinstance(found, dict) or found.get("type") != "file" or found.get("encoding") != "base64":
        raise Dropped("refused")
    try:
        data = base64.b64decode(found.get("content") or "")
        if len(data) > MAX_FILE_BYTES:
            raise Dropped("refused")
        return json.loads(data.decode("utf-8"))
    except (ValueError, RecursionError):
        # A file nested some thousands deep fits well under MAX_FILE_BYTES
        # and makes json.loads recurse past Python's limit; it is refused
        # like any other file that is not one, and the run goes on.
        raise Dropped("refused") from None


def pem_bytes(key):
    """The App's key as one PEM, whether it came as a path or as text
    with real, escaped or Windows newlines, so every form of one key
    derives the same salt. An unreadable path raises OSError, which the
    settings name without showing."""
    text = Path(key.path).read_text(encoding="ascii") if key.path else key.text
    # read_text turns a file's \r\n into \n; a secret pasted with \r\n
    # must lose it too, or one key would give two salts.
    return pem_text(text.replace("\r\n", "\n").replace("\r", "\n")).encode("ascii")


def derived_salt(key):
    """The salt the App's key gives: HMAC-SHA256 of the PEM under
    SALT_LABEL, in hex, which is HKDF's extract step with the label as
    its salt. SHA-256 cannot be run backwards, so the 64 hex digits say
    nothing of the key, and the same key gives the same digits every
    time."""
    return hmac.new(SALT_LABEL, pem_bytes(key), hashlib.sha256).hexdigest()


def repository_hash(salt, node_id):
    """The repository as the dataset names it: HMAC-SHA256 of its node id
    under the salt, in hex. The node id stays the same when a repository
    is renamed or moves to another owner, so its line does too."""
    return hmac.new(salt.encode("utf-8"), node_id.encode("utf-8"), hashlib.sha256).hexdigest()


def record(repo, day, kept_file):
    return {"repo": repo, "collected_at": day, **kept_file}


@dataclass
class Collected:
    metrics: list = field(default_factory=list)
    judges: list = field(default_factory=list)
    tally: Counter = field(default_factory=Counter)


def counted(read, tally):
    """read(), or None with the reason counted when it drops the file or
    GitHub could not be read."""
    try:
        return read()
    except Dropped as dropped:
        tally[dropped.reason] += 1
    except READ_ERRORS:
        tally["unreadable"] += 1
    return None


def left_out(repository):
    """Why a listed repository is not read, as the tally counts it, or
    None. A fork's branch metrics is its upstream's, frozen on the day of
    the fork: read, it would enter the dataset a second time under the
    fork's own hash, and the salt would hide the double afterwards. An
    archived repository's files are frozen too, and its project is over.
    Only GitHub's own true counts; a field that is missing, or holds
    anything else, leaves the repository in."""
    if repository.get("fork") is True:
        return "forks"
    if repository.get("archived") is True:
        return "archived"
    return None


def collect_repository(client, repository, salt, day, collected):
    """Add what one repository shares to collected. Its JUDGE.json is
    read only after a METRICS.json that shares, since the switch lives in
    METRICS.json and a project without one has said nothing."""
    tally = collected.tally
    skipped = left_out(repository)
    if skipped:
        tally[skipped] += 1
        return
    node_id = repository.get("node_id")
    if not isinstance(node_id, str) or not node_id:
        tally["unreadable"] += 1
        return
    full_name = repository["full_name"]
    document = counted(lambda: read_document(client, full_name, METRICS_FILE), tally)
    metrics = None if document is None else counted(lambda: shared_metrics(document), tally)
    if metrics is None:
        return
    repo = repository_hash(salt, node_id)
    collected.metrics.append(record(repo, day, metrics))
    tally["shared"] += 1
    document = counted(lambda: read_document(client, full_name, JUDGE_FILE), tally)
    judge = None if document is None else counted(lambda: shared_judge(document), tally)
    if judge is not None:
        collected.judges.append(record(repo, day, judge))
        tally["judges"] += 1


def collect_installation(installation, tokens, salt, day, collected, transport, api):
    """Every repository one installation lets the App see."""
    client = Client(tokens, installation["id"], transport, api)
    try:
        repositories = client.get_all("/installation/repositories", key="repositories")
    except READ_ERRORS:
        collected.tally["unreadable"] += 1
        return
    for repository in repositories:
        collected.tally["repositories"] += 1
        collect_repository(client, repository, salt, day, collected)


def collect(app_jwt_source, salt, day, transport=urllib_transport, api=API):
    """What every installation shares today. app_jwt_source gives the
    App's JWT for each call that needs it; a failure to list the
    installations raises, since nothing can be collected without them."""
    collected = Collected()
    tokens = InstallationTokens(app_jwt_source, transport, api, permissions=READ_ONLY)
    for installation in Api(app_jwt_source, transport, api).get_all("/app/installations"):
        if installation.get("suspended_at"):
            collected.tally["suspended"] += 1
            continue
        collected.tally["installations"] += 1
        collect_installation(installation, tokens, salt, day, collected, transport, api)
    return collected


def plural(number, noun, nouns=None):
    return f"{number} {noun if number == 1 else nouns or noun + 's'}"


# How a file, a repository or an installation can fail to reach the
# dataset, as the log counts them: the forks and the archived repositories
# are skipped unread (left_out), the rest read and dropped.
OTHER_OUTCOMES = ("not_shared", "refused", "unreadable", "forks", "archived", "suspended")


def outcome(name, number):
    """One count of the summary's second half: a fork is a noun ("2
    forks"), the other outcomes read as states ("2 refused")."""
    return plural(number, "fork") if name == "forks" else f"{number} {name.replace('_', ' ')}"


def summary(tally):
    """The run in one line of counts, which is all a log line here says."""
    line = ", ".join([plural(tally["installations"], "installation"),
                      plural(tally["repositories"], "repository", "repositories"),
                      f"{tally['shared']} shared metrics", plural(tally["judges"], "judge")])
    others = [outcome(name, tally[name]) for name in OTHER_OUTCOMES if tally[name]]
    return line + ("; " + ", ".join(others) if others else "")


def line_of(found):
    return json.dumps(found, ensure_ascii=True)


def key_of(found):
    """The repository and the day a line is for, or None for a line that
    is not one of this script's, which is kept as it is."""
    if not isinstance(found, dict):
        return None
    return found.get("repo"), found.get("collected_at")


def key_of_line(line):
    try:
        return key_of(json.loads(line))
    except ValueError:
        return None


def merged(lines, records):
    """The file's lines with records in, and how many replaced a line: a
    record takes the place of the line for the same repository and day,
    and goes at the end when there is none, so a run repeated on one day
    adds nothing and leaves every other line as it was."""
    waiting = {key_of(found): line_of(found) for found in records}
    result, replaced = [], 0
    for line in lines:
        key = key_of_line(line)
        if key in waiting:
            result.append(waiting.pop(key))
            replaced += 1
        else:
            result.append(line)
    return result + list(waiting.values()), replaced


def existing_lines(path):
    return path.read_text(encoding="utf-8").splitlines() if path.exists() else []


def write_lines(path, lines):
    """Replace path with lines in one step, so a run stopped halfway
    never leaves half a file for the workflow to commit."""
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.")
    try:
        with os.fdopen(descriptor, "w", encoding="ascii", newline="\n") as handle:
            handle.write("".join(f"{line}\n" for line in lines))
        os.replace(temporary, path)
    except BaseException:
        os.unlink(temporary)
        raise


def store(path, records, dry_run=False):
    """Merge records into the file at path, or with dry_run only say what
    would be written; either way the report is counts and the lines."""
    if not records:
        return [f"{path.name}: nothing to write"]
    before = existing_lines(path)
    after, replaced = merged(before, records)
    lines = plural(len(records), "line")
    if dry_run:
        return ([f"{path.name}: {lines} would be written, {replaced} replacing today's"]
                + [line_of(found) for found in records])
    if after == before:
        return [f"{path.name}: {lines}, the same as today's already there"]
    write_lines(path, after)
    return [f"{path.name}: {lines} written, {replaced} replacing today's"]


@dataclass(frozen=True)
class Settings:
    app_id: str
    key: AppKey
    salt: str = field(repr=False)

    @classmethod
    def from_environment(cls, environ):
        """The settings, or SystemExit naming (never showing) what is
        missing. The salt is the override when it is set, and the one the
        App's key gives otherwise; an override too short to stand is
        refused rather than quietly replaced, since the owner who set it
        meant it to be the salt."""
        problems = [] if environ.get(APP_ID_VARIABLE) else [f"{APP_ID_VARIABLE} is not set"]
        key = salt = None
        try:
            key = AppKey.from_environment(environ)
        except SigningError as error:
            problems.append(str(error))
        override = (environ.get(SALT_VARIABLE) or "").strip()
        if override and len(override) < SALT_MINIMUM:
            problems.append(f"{SALT_VARIABLE} is shorter than {SALT_MINIMUM} characters; unset it to derive "
                            "the salt from the App's key, or make one with "
                            "python3 -c \"import secrets; print(secrets.token_hex(32))\"")
        elif override:
            salt = override
        elif key is not None:
            try:
                salt = derived_salt(key)
            except (OSError, UnicodeError):
                # The path's file is missing, unreadable or no text; its
                # name is not shown, since a message may be logged.
                problems.append("the App's private key could not be read to derive the salt from")
        if problems:
            raise SystemExit("collect: cannot run: " + "; ".join(problems))
        return cls(app_id=environ[APP_ID_VARIABLE], key=key, salt=salt)


def arguments(argv):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", default="data", help="the directory of metrics.jsonl and judge.jsonl "
                                                      "(default: data)")
    parser.add_argument("--env-file", help="read the settings from this file as well, as scripts/register.py "
                                           "writes it; the environment wins over it")
    parser.add_argument("--dry-run", action="store_true", help="print the counts and the lines, write nothing")
    return parser.parse_args(argv)


def main(argv=None, environ=None, transport=urllib_transport, today=None):
    args = arguments(argv)
    environ = os.environ if environ is None else environ
    if args.env_file:
        envfile.load_into_environment(args.env_file, environ)
    settings = Settings.from_environment(environ)
    day = today or datetime.now(timezone.utc).date().isoformat()
    try:
        collected = collect(lambda: app_jwt(settings.app_id, settings.key), settings.salt, day, transport)
    except (GitHubError, SigningError, OSError, http.client.HTTPException) as error:
        # Only the App's own calls get here, the list of its installations
        # and the signature of its JWT, and neither names a repository; a
        # repository's errors are counted where they happen, never shown.
        print(f"collect: {error}", file=sys.stderr)
        return 1
    print(summary(collected.tally))
    out = Path(args.out)
    for name, records in ((METRICS_LINES, collected.metrics), (JUDGE_LINES, collected.judges)):
        for line in store(out / name, records, args.dry_run):
            print(line)
    return 0


if __name__ == "__main__":
    sys.exit(main())
