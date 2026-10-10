"""scripts/collect.py against a fake GitHub: two installations of the App
whose repositories hold, on the branch metrics, every case the collector
must answer: a project that shares its metrics and its judge, one that
switched sharing off, one with no branch metrics, one whose files carry
keys and text the format does not allow, one with the wrong schema, and one
whose judge has the wrong schema. Besides what the dataset holds, the
tests hold the collector to what it must never do: read any path but the
two files, or write a repository's name, owner, node id, installation or
URL anywhere."""

import base64
import contextlib
import hashlib
import hmac
import importlib.util
import io
import json
import tempfile
import unittest
from pathlib import Path

from tests.fakes import FakeTransport, OpensslKey, json_response

ROOT = Path(__file__).resolve().parent.parent
SPEC = importlib.util.spec_from_file_location("collect", ROOT / "scripts" / "collect.py")
collect = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(collect)

API = "https://api.github.com"
SALT = "a-salt-for-these-tests-only-0123456789"
TODAY = "2026-10-10"
ALICE = 70011234
BOB = 70025678
APP_JWT = "app-jwt-for-tests"
# What the log says of the world below: counts, and nothing else.
SUMMARY = "2 installations, 6 repositories, 3 shared metrics, 2 judges; 1 not shared, 2 refused"

ORCHARD = ("alice-co/orchard-api", "R_kgDOorchard1")
QUIET = ("alice-co/quiet-garden", "R_kgDOquietga2")
EMPTY = ("alice-co/empty-field", "R_kgDOemptyfi3")
NOISY = ("bob-labs/noisy-river", "R_kgDOnoisyri4")
OLD = ("bob-labs/old-mill", "R_kgDOoldmill5")
LANTERN = ("bob-labs/lantern-works", "R_kgDOlantern6")
REPOSITORIES = {ALICE: [ORCHARD, QUIET, EMPTY], BOB: [NOISY, OLD, LANTERN]}

# Whatever names a repository, its owner, an installation or GitHub; none
# of it may reach the dataset or the log.
FORBIDDEN = (["alice-co", "bob-labs", "github.com", "mill wheel", str(ALICE), str(BOB), "token-"]
             + [part for full_name, node_id in REPOSITORIES[ALICE] + REPOSITORIES[BOB]
                for part in (full_name.split("/")[1], node_id)])


def metrics(**changes):
    document = {
        "schema": "sdlc-metrics/1", "generated_at": "2026-10-10T04:00:00Z", "window_days": 30, "sharing": "on",
        "protocol_version": "0.2.0 f530a66",
        "counts": {"claims": 9, "pull_requests_opened": 8, "merged": 6, "closed_unmerged": 1, "reviews": 11,
                   "changes_requested": 2, "check_runs_passed": 30, "check_runs_failed": 4, "conflicts_seen": 1,
                   "released_claims": 1, "contributors": 3},
        "durations_seconds": {"claim_to_first_pull_request": {"median": 600, "p90": 3600},
                              "open_to_merge": {"median": 7200, "p90": 86400},
                              "first_review": {"median": 1800, "p90": 14400.5}},
        "rates": {"merge_rate": 0.75, "first_check_pass_rate": 0.5},
    }
    document.update(changes)
    return document


def judge(**changes):
    document = {
        "schema": "sdlc-judge/1", "generated_at": "2026-10-09T21:30:00Z", "model": "claude-opus-5-5",
        "prompt_variant": "appF-7", "conversations": 5,
        "counts": {"C1a": 1, "C1b": 0, "C2": 2, "C3a": 0, "C3b": 1, "C4a": 0, "C4b": 3},
        "groups": {"unresponsiveness": 3, "hallucination": 1, "repetition": 3},
    }
    document.update(changes)
    return document


# A project's files with keys the format does not name and text where it
# says a number, much of it naming the project.
NOISY_METRICS = metrics(
    repository="bob-labs/noisy-river", owner="bob-labs", titles=["Fix the mill wheel"],
    generated_at="written by bob-labs", protocol_version="0.2.0 on bob-labs/noisy-river",
    counts={"claims": 4, "merged": "bob-labs/noisy-river merged seven", "reviews": True, "conflicts_seen": -1,
            "contributors": 2.0, "logins": 2, "check_runs_failed": [1]},
    durations_seconds={"open_to_merge_median": 300, "open_to_merge_p90": "slow",
                       "first_review": {"median": 60, "p90": None, "note": 5}, "branch_names": {"median": 1}},
    rates={"merge_rate": 1.5, "first_check_pass_rate": 0.25, "secret_rate": 0.1},
)
NOISY_METRICS_KEPT = {
    "schema": "sdlc-metrics/1", "window_days": 30, "sharing": "on",
    "counts": {"claims": 4, "contributors": 2},
    "durations_seconds": {"open_to_merge": {"median": 300}, "first_review": {"median": 60}},
    "rates": {"first_check_pass_rate": 0.25},
}
NOISY_JUDGE = judge(quotes=["bob-labs said the mill wheel was fixed"],
                    model="claude-opus-5-5 reading bob-labs/noisy-river",
                    counts={"C1a": "many", "C2": 2, "C5": 1, "bob-labs": 3}, groups={"repetition": 1, "names": 2})
NOISY_JUDGE_KEPT = {"schema": "sdlc-judge/1", "generated_at": "2026-10-09T21:30:00Z", "prompt_variant": "appF-7",
                    "conversations": 5, "counts": {"C2": 2}, "groups": {"repetition": 1}}


def files():
    """What each repository holds on its branch metrics; a file not here is
    a 404, as is every file of a repository without the branch."""
    return {
        (ORCHARD[0], "METRICS.json"): metrics(),
        (ORCHARD[0], "JUDGE.json"): judge(),
        (QUIET[0], "METRICS.json"): {"schema": "sdlc-metrics/1", "sharing": "off"},
        (QUIET[0], "JUDGE.json"): judge(),
        (NOISY[0], "METRICS.json"): NOISY_METRICS,
        (NOISY[0], "JUDGE.json"): NOISY_JUDGE,
        (OLD[0], "METRICS.json"): metrics(schema="sdlc-metrics/0"),
        (OLD[0], "JUDGE.json"): judge(),
        (LANTERN[0], "METRICS.json"): metrics(),
        (LANTERN[0], "JUDGE.json"): judge(schema="judge/2"),
    }


def repository(full_name, node_id, number):
    """A repository as GET /installation/repositories lists it, names, URLs and all."""
    owner, name = full_name.split("/")
    return {"id": 900 + number, "node_id": node_id, "name": name, "full_name": full_name, "private": True,
            "owner": {"login": owner, "html_url": f"https://github.com/{owner}"},
            "html_url": f"https://github.com/{full_name}", "url": f"{API}/repos/{full_name}"}


def installation(number, login, suspended=False):
    return {"id": number, "account": {"login": login, "html_url": f"https://github.com/{login}"},
            "html_url": f"https://github.com/settings/installations/{number}",
            "suspended_at": "2026-10-01T00:00:00Z" if suspended else None}


def file_response(full_name, name, document):
    """The contents API's answer: the file in base64, broken into lines as GitHub sends it."""
    return json_response({"type": "file", "encoding": "base64", "name": name, "path": name,
                          "content": base64.encodebytes(json.dumps(document).encode("utf-8")).decode("ascii"),
                          "html_url": f"https://github.com/{full_name}/blob/metrics/{name}"})


def raw_file(data):
    """The contents API's answer for a file of these bytes, whatever they are."""
    return json_response({"type": "file", "encoding": "base64", "content": base64.b64encode(data).decode("ascii")})


class World:
    """GitHub as the App sees it: installations listed over two pages, each
    with its token, each token seeing only its own repositories (Bob's over
    two pages), and the files above at the ref metrics only."""

    def __init__(self, held=None, installations=None, failing=()):
        self.files = files() if held is None else dict(held)
        self.installations = installations or [installation(ALICE, "alice-co"), installation(BOB, "bob-labs")]
        self.failing = set(failing)
        self.owners = {full_name: number for number, listed in REPOSITORIES.items() for full_name, _ in listed}
        routes = {("GET", "/app/installations"): self.list_installations,
                  ("GET", "/installation/repositories"): self.list_repositories}
        for number in REPOSITORIES:
            routes[("POST", f"/app/installations/{number}/access_tokens")] = self.grant
        for full_name in self.owners:
            for name in ("METRICS.json", "JUDGE.json"):
                routes[("GET", f"/repos/{full_name}/contents/{name}")] = self.contents
        self.transport = FakeTransport(routes, API)

    def list_installations(self, call):
        if call["query"].get("page") == ["2"]:
            return json_response(self.installations[1:])
        link = f'<{API}/app/installations?per_page=100&page=2>; rel="next"'
        return json_response(self.installations[:1], headers={"link": link} if self.installations[1:] else {})

    def grant(self, call):
        number = int(call["path"].split("/")[3])
        if number in self.failing:
            return json_response({"message": "This installation has been suspended"}, 403)
        return json_response({"token": f"token-{number}", "expires_at": "2099-01-01T00:00:00Z"}, 201)

    def token_owner(self, call):
        return int(call["headers"]["Authorization"].removeprefix("Bearer token-"))

    def list_repositories(self, call):
        number = self.token_owner(call)
        listed = [repository(full_name, node_id, index)
                  for index, (full_name, node_id) in enumerate(REPOSITORIES[number])]
        if number != BOB:
            return json_response({"total_count": len(listed), "repositories": listed})
        if call["query"].get("page") == ["2"]:
            return json_response({"total_count": len(listed), "repositories": listed[2:]})
        link = f'<{API}/installation/repositories?per_page=100&page=2>; rel="next"'
        return json_response({"total_count": len(listed), "repositories": listed[:2]}, headers={"link": link})

    def contents(self, call):
        full_name, name = call["path"].removeprefix("/repos/").split("/contents/")
        if full_name in self.failing:
            return json_response({"message": "Server Error"}, 502)
        found = self.files.get((full_name, name))
        if (found is None or call["query"].get("ref") != ["metrics"]
                or self.token_owner(call) != self.owners[full_name]):
            return json_response({"message": "Not Found"}, 404)
        return file_response(full_name, name, found)


def hash_of(node_id, salt=SALT):
    return hmac.new(salt.encode("utf-8"), node_id.encode("utf-8"), hashlib.sha256).hexdigest()


def run(world, day=TODAY):
    return collect.collect(lambda: APP_JWT, SALT, day, world.transport, API)


def by_repo(records):
    return {found["repo"]: found for found in records}


def read_lines(path):
    return [json.loads(line) for line in path.read_text(encoding="ascii").splitlines()] if path.exists() else []


class CollectTest(unittest.TestCase):
    def setUp(self):
        self.world = World()
        self.collected = run(self.world)
        self.metrics = by_repo(self.collected.metrics)
        self.judges = by_repo(self.collected.judges)

    def test_shared_metrics_and_judge_become_a_record_each_under_the_hash(self):
        self.assertEqual(self.metrics[hash_of(ORCHARD[1])],
                         {"repo": hash_of(ORCHARD[1]), "collected_at": TODAY, **metrics()})
        self.assertEqual(self.judges[hash_of(ORCHARD[1])],
                         {"repo": hash_of(ORCHARD[1]), "collected_at": TODAY, **judge()})
        self.assertEqual(list(self.metrics[hash_of(ORCHARD[1])])[:2], ["repo", "collected_at"])

    def test_sharing_off_drops_the_metrics_and_the_judge_unread(self):
        self.assertNotIn(hash_of(QUIET[1]), self.metrics)
        self.assertNotIn(hash_of(QUIET[1]), self.judges)
        self.assertNotIn(f"/repos/{QUIET[0]}/contents/JUDGE.json", self.world.transport.paths())

    def test_no_branch_metrics_is_nothing_to_collect(self):
        self.assertNotIn(hash_of(EMPTY[1]), self.metrics)
        self.assertNotIn(f"/repos/{EMPTY[0]}/contents/JUDGE.json", self.world.transport.paths())
        self.assertIn(f"/repos/{EMPTY[0]}/contents/METRICS.json", self.world.transport.paths())

    def test_keys_the_format_does_not_name_and_text_where_a_number_belongs_are_stripped(self):
        self.assertEqual(self.metrics[hash_of(NOISY[1])],
                         {"repo": hash_of(NOISY[1]), "collected_at": TODAY, **NOISY_METRICS_KEPT})
        self.assertEqual(self.judges[hash_of(NOISY[1])],
                         {"repo": hash_of(NOISY[1]), "collected_at": TODAY, **NOISY_JUDGE_KEPT})

    def test_a_wrong_schema_is_dropped(self):
        self.assertNotIn(hash_of(OLD[1]), self.metrics)
        self.assertNotIn(hash_of(OLD[1]), self.judges)
        self.assertIn(hash_of(LANTERN[1]), self.metrics, "the metrics stand when only the judge is wrong")
        self.assertNotIn(hash_of(LANTERN[1]), self.judges)

    def test_the_counts(self):
        self.assertEqual(collect.summary(self.collected.tally), SUMMARY)

    def test_every_installation_and_repository_page_is_read(self):
        self.assertEqual(self.world.transport.paths("POST"), [f"/app/installations/{ALICE}/access_tokens",
                                                              f"/app/installations/{BOB}/access_tokens"])
        listed = [call for call in self.world.transport.calls if call["path"] == "/installation/repositories"]
        self.assertEqual(len(listed), 3)
        self.assertIn(f"/repos/{LANTERN[0]}/contents/METRICS.json", self.world.transport.paths())

    def test_only_the_two_files_at_the_ref_metrics_are_ever_requested(self):
        allowed = {("GET", "/app/installations"), ("GET", "/installation/repositories")}
        allowed |= {("POST", f"/app/installations/{number}/access_tokens") for number in REPOSITORIES}
        for call in self.world.transport.calls:
            with self.subTest(url=call["url"]):
                self.assertTrue(call["url"].startswith(f"{API}/"))
                if call["path"].startswith("/repos/"):
                    self.assertRegex(call["path"], r"^/repos/[^/]+/[^/]+/contents/(METRICS|JUDGE)\.json$")
                    self.assertEqual(call["query"], {"ref": ["metrics"]})
                    self.assertEqual(call["method"], "GET")
                else:
                    self.assertIn((call["method"], call["path"]), allowed)
        judged = sorted(path.split("/contents/")[0].removeprefix("/repos/")
                        for path in self.world.transport.paths() if path.endswith("/JUDGE.json"))
        self.assertEqual(judged, sorted([ORCHARD[0], NOISY[0], LANTERN[0]]))

    def test_the_reader_refuses_any_other_path_before_asking(self):
        client = collect.Client(collect.InstallationTokens(lambda: APP_JWT, self.world.transport, API), ALICE,
                                self.world.transport, API)
        before = len(self.world.transport.calls)
        with self.assertRaises(RuntimeError):
            collect.read_document(client, ORCHARD[0], "README.md")
        self.assertEqual(len(self.world.transport.calls), before)

    def test_each_token_is_asked_for_with_the_app_jwt_and_can_only_read(self):
        for call in self.world.transport.calls:
            if call["method"] == "POST":
                self.assertEqual(call["headers"]["Authorization"], f"Bearer {APP_JWT}")
                self.assertEqual(call["body"], {"permissions": {"contents": "read", "metadata": "read"}})
            if call["path"] == "/app/installations":
                self.assertEqual(call["headers"]["Authorization"], f"Bearer {APP_JWT}")

    def test_the_records_name_no_repository(self):
        text = json.dumps([self.collected.metrics, self.collected.judges])
        for forbidden in FORBIDDEN:
            self.assertNotIn(forbidden, text)


class FailureTest(unittest.TestCase):
    def test_a_repository_that_cannot_be_read_is_counted_and_the_rest_collected(self):
        world = World(failing={ORCHARD[0]})
        collected = run(world)
        self.assertNotIn(hash_of(ORCHARD[1]), by_repo(collected.metrics))
        self.assertIn(hash_of(NOISY[1]), by_repo(collected.metrics))
        self.assertEqual(collected.tally["unreadable"], 1)
        self.assertTrue(collect.summary(collected.tally).endswith("1 unreadable"))

    def test_an_installation_without_a_token_is_counted_and_the_other_collected(self):
        collected = run(World(failing={ALICE}))
        self.assertEqual(collected.tally["unreadable"], 1)
        self.assertEqual(sorted(by_repo(collected.metrics)), sorted([hash_of(NOISY[1]), hash_of(LANTERN[1])]))

    def test_a_suspended_installation_is_left_alone(self):
        world = World(installations=[installation(ALICE, "alice-co", suspended=True), installation(BOB, "bob-labs")])
        collected = run(world)
        self.assertNotIn(f"/app/installations/{ALICE}/access_tokens", world.transport.paths())
        self.assertEqual(collected.tally["suspended"], 1)
        self.assertEqual(collected.tally["installations"], 1)

    def test_a_file_that_is_not_one_is_refused(self):
        for document in ([metrics()], "sdlc-metrics/1", 5):
            with self.subTest(document=document):
                world = World({(ORCHARD[0], "METRICS.json"): document})
                self.assertEqual(run(world).tally["refused"], 1)

    def test_a_file_too_large_to_be_inline_or_not_json_is_refused(self):
        # The oversized file and the one in another encoding are a good
        # METRICS.json otherwise, so only the size check and the encoding
        # check can refuse them.
        world = World()
        path = f"/repos/{ORCHARD[0]}/contents/METRICS.json"
        good = json.dumps(metrics()).encode("utf-8")
        for answer in ({"type": "file", "encoding": "none", "content": base64.b64encode(good).decode()},
                       {"type": "file", "encoding": "base64", "content": base64.b64encode(b"not json").decode()},
                       {"type": "file", "encoding": "base64",
                        "content": base64.b64encode(good + b" " * collect.MAX_FILE_BYTES).decode()},
                       [{"type": "file"}]):
            with self.subTest(answer=str(answer)[:40]):
                world.transport.routes[("GET", path)] = json_response(answer)
                collected = run(world)
                self.assertEqual(collected.tally["refused"], 3)
                self.assertNotIn(hash_of(ORCHARD[1]), by_repo(collected.metrics))

    def test_a_file_nested_too_deep_to_parse_is_refused_and_the_rest_collected(self):
        # Both fit under MAX_FILE_BYTES, and json.loads raises
        # RecursionError on them, which is no ValueError.
        deep = b"[" * 30000 + b"]" * 30000
        inside = json.dumps(metrics()).encode("utf-8")[:-1] + b', "deep": ' + deep + b"}"
        for data in (b"[" * 60000, inside):
            with self.subTest(size=len(data)):
                self.assertLess(len(data), collect.MAX_FILE_BYTES)
                world = World()
                world.transport.routes[("GET", f"/repos/{ORCHARD[0]}/contents/METRICS.json")] = raw_file(data)
                collected = run(world)
                self.assertEqual(collected.tally["refused"], 3)
                self.assertNotIn(hash_of(ORCHARD[1]), by_repo(collected.metrics))
                self.assertEqual(sorted(by_repo(collected.metrics)), sorted([hash_of(NOISY[1]), hash_of(LANTERN[1])]))

    def test_a_judge_nested_too_deep_to_parse_is_refused_and_the_metrics_kept(self):
        data = b'{"counts": ' + b"[" * 50000
        self.assertLess(len(data), collect.MAX_FILE_BYTES)
        world = World()
        world.transport.routes[("GET", f"/repos/{ORCHARD[0]}/contents/JUDGE.json")] = raw_file(data)
        collected = run(world)
        self.assertEqual(collected.tally["refused"], 3)
        self.assertIn(hash_of(ORCHARD[1]), by_repo(collected.metrics))
        self.assertNotIn(hash_of(ORCHARD[1]), by_repo(collected.judges))
        self.assertIn(hash_of(NOISY[1]), by_repo(collected.judges))

    def test_a_number_too_large_for_a_float_is_left_out_and_the_rest_collected(self):
        # A 401-digit integer is valid JSON and under Python's limit on
        # digits, but math.isfinite cannot take it.
        huge = 10 ** 400
        held = files()
        held[(ORCHARD[0], "METRICS.json")] = metrics(
            durations_seconds={"open_to_merge": {"median": huge, "p90": 60}, "first_review_median": huge},
            rates={"merge_rate": huge, "first_check_pass_rate": 0.5})
        collected = run(World(held))
        kept = by_repo(collected.metrics)[hash_of(ORCHARD[1])]
        self.assertEqual(kept["durations_seconds"], {"open_to_merge": {"p90": 60}})
        self.assertEqual(kept["rates"], {"first_check_pass_rate": 0.5})
        self.assertEqual(collected.tally["shared"], 3)
        self.assertEqual(collect.summary(collected.tally), SUMMARY)


class ValuesTest(unittest.TestCase):
    def test_counts_are_whole_numbers_from_zero(self):
        self.assertEqual(collect.count(0), 0)
        self.assertEqual(collect.count(3.0), 3)
        for value in (True, False, -1, 2.5, float("nan"), float("inf"), "3", None, [3]):
            self.assertIsNone(collect.count(value), value)

    def test_durations_and_rates_are_finite_and_in_range(self):
        self.assertEqual(collect.duration(14400.5), 14400.5)
        self.assertEqual(collect.rate(0), 0)
        self.assertEqual(collect.rate(1), 1)
        self.assertEqual(collect.duration(10 ** 300), 10 ** 300)
        for value in (-1, float("inf"), float("nan"), True, "60", 10 ** 400, -10 ** 400):
            self.assertIsNone(collect.duration(value), value)
        for value in (1.01, -0.1, float("nan"), True, "0.5", 10 ** 400):
            self.assertIsNone(collect.rate(value), value)

    def test_a_protocol_version_is_a_release_with_or_without_its_commit(self):
        # tools/metrics.py in the template writes the release and the short
        # commit from tools/VENDORED's first line.
        clean = collect.matching(collect.VERSION)
        for value in ("0.2.0", "0.2.0 f530a66", "0.2.0 " + "f530a66" * 5 + "abcde"):
            self.assertEqual(clean(value), value)
        for value in ("0.2.0 on bob-labs/noisy-river", "0.2.0 F530A66", "0.2.0 f530a6", "0.2.0  f530a66",
                      "0.2.0 f530a66 ", "v0.2.0", "0.2", "0.2.0 " + "f" * 41, 20):
            self.assertIsNone(clean(value), value)

    def test_a_time_is_written_again_in_utc(self):
        self.assertEqual(collect.timestamp("2026-10-10T06:17:00.123+02:00"), "2026-10-10T04:17:00Z")
        self.assertEqual(collect.timestamp("2026-10-10T04:17:00"), "2026-10-10T04:17:00Z")
        for value in ("yesterday", "2026-10-10T04:17:00Z bob-labs", 1790000000, None, "9" * 41):
            self.assertIsNone(collect.timestamp(value), value)

    def test_a_model_and_a_variant_are_identifiers(self):
        clean = collect.matching(collect.IDENTIFIER)
        for value in ("claude-opus-5-5", "claude-opus-5-5[1m]", "appF-7", "sonnet"):
            self.assertEqual(clean(value), value)
        for value in ("claude opus", "bob-labs/noisy-river", "a" * 65, "", 7, "-x"):
            self.assertIsNone(clean(value), value)

    def test_durations_nested_or_flat_are_kept_nested(self):
        self.assertEqual(collect.durations({"open_to_merge": {"median": 5, "p90": 9},
                                            "first_review_median": 3, "first_review_p90": 4}),
                         {"open_to_merge": {"median": 5, "p90": 9}, "first_review": {"median": 3, "p90": 4}})

    def test_the_hash_is_hmac_sha256_of_the_node_id_under_the_salt(self):
        hashed = collect.repository_hash(SALT, ORCHARD[1])
        self.assertEqual(hashed, hmac.new(SALT.encode(), ORCHARD[1].encode(), hashlib.sha256).hexdigest())
        self.assertRegex(hashed, r"^[0-9a-f]{64}$")
        self.assertNotEqual(hashed, collect.repository_hash(SALT + "x", ORCHARD[1]))


class MainTest(unittest.TestCase):
    """The script as the workflow runs it: the App's JWT signed by openssl
    from the key in the environment, the files written under --out."""

    @classmethod
    def setUpClass(cls):
        cls.key = OpensslKey()

    @classmethod
    def tearDownClass(cls):
        cls.key.close()

    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.out = Path(self.directory.name) / "data"

    def environment(self, salt=SALT):
        environ = {"SDLC_APP_ID": "123456", "SDLC_APP_PRIVATE_KEY": self.key.text()}
        if salt is not None:
            environ["SDLC_METRICS_SALT"] = salt
        return environ

    def main(self, world, *flags, day=TODAY, environ=None):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            status = collect.main(["--out", str(self.out), *flags], environ or self.environment(),
                                  world.transport, today=day)
        return status, out.getvalue()

    def test_the_lines_are_written_and_stdout_says_counts_only(self):
        status, stdout = self.main(World())
        self.assertEqual(status, 0)
        self.assertEqual(stdout.splitlines(), [
            SUMMARY,
            "metrics.jsonl: 3 lines written, 0 replacing today's",
            "judge.jsonl: 2 lines written, 0 replacing today's",
        ])
        self.assertEqual(len(read_lines(self.out / "metrics.jsonl")), 3)
        self.assertEqual(len(read_lines(self.out / "judge.jsonl")), 2)

    def test_the_app_jwt_is_signed_with_the_key(self):
        world = World()
        self.main(world)
        token = world.transport.calls[0]["headers"]["Authorization"].removeprefix("Bearer ")
        header, claims, signature = token.split(".")
        padded = signature + "=" * (-len(signature) % 4)
        self.assertTrue(self.key.verifies(f"{header}.{claims}".encode("ascii"), base64.urlsafe_b64decode(padded)))

    def test_no_repository_name_owner_or_node_id_reaches_the_files_or_stdout(self):
        world = World(failing={OLD[0]})
        _, stdout = self.main(world)
        _, dry = self.main(world, "--dry-run")
        written = "".join(path.read_text(encoding="ascii") for path in sorted(self.out.iterdir()))
        for forbidden in FORBIDDEN:
            with self.subTest(forbidden=forbidden):
                self.assertNotIn(forbidden, written)
                self.assertNotIn(forbidden, stdout)
                self.assertNotIn(forbidden, dry)

    def test_a_second_run_on_the_same_day_replaces_its_lines(self):
        self.out.mkdir()
        yesterday = json.dumps({"repo": hash_of(ORCHARD[1]), "collected_at": "2026-10-09",
                                "schema": "sdlc-metrics/1"})
        (self.out / "metrics.jsonl").write_text(yesterday + "\n", encoding="ascii")
        self.main(World())
        changed = files()
        changed[(ORCHARD[0], "METRICS.json")] = metrics(counts={"merged": 7})
        _, stdout = self.main(World(changed))
        self.assertIn("metrics.jsonl: 3 lines written, 3 replacing today's", stdout)
        lines = read_lines(self.out / "metrics.jsonl")
        self.assertEqual(len(lines), 4)
        self.assertEqual((self.out / "metrics.jsonl").read_text(encoding="ascii").splitlines()[0], yesterday)
        today = [line for line in lines if line["repo"] == hash_of(ORCHARD[1]) and line["collected_at"] == TODAY]
        self.assertEqual(len(today), 1)
        self.assertEqual(today[0]["counts"], {"merged": 7})
        self.assertEqual(len(read_lines(self.out / "judge.jsonl")), 2)

    def test_the_same_run_again_changes_no_file(self):
        self.main(World())
        before = {path.name: path.read_bytes() for path in self.out.iterdir()}
        _, stdout = self.main(World())
        self.assertIn("metrics.jsonl: 3 lines, the same as today's already there", stdout)
        self.assertEqual({path.name: path.read_bytes() for path in self.out.iterdir()}, before)

    def test_the_next_day_adds_lines(self):
        self.main(World())
        self.main(World(), day="2026-10-11")
        self.assertEqual(len(read_lines(self.out / "metrics.jsonl")), 6)
        self.assertEqual(len(read_lines(self.out / "judge.jsonl")), 4)

    def test_a_dry_run_prints_the_counts_and_lines_and_writes_nothing(self):
        status, stdout = self.main(World(), "--dry-run")
        self.assertEqual(status, 0)
        self.assertFalse(self.out.exists())
        lines = stdout.splitlines()
        self.assertEqual(lines[0], SUMMARY)
        self.assertEqual(lines[1], "metrics.jsonl: 3 lines would be written, 0 replacing today's")
        self.assertEqual(json.loads(lines[2])["repo"], hash_of(ORCHARD[1]))
        self.assertEqual(lines[5], "judge.jsonl: 2 lines would be written, 0 replacing today's")
        self.assertEqual(len(lines), 8)

    def test_without_the_salt_nothing_is_asked_or_written(self):
        for salt, reason in ((None, "SDLC_METRICS_SALT is not set"), ("", "SDLC_METRICS_SALT is not set"),
                             ("a-short-salt", "shorter than 32 characters")):
            with self.subTest(salt=salt):
                world = World()
                with self.assertRaises(SystemExit) as refused:
                    self.main(world, environ=self.environment(salt))
                self.assertIn(reason, str(refused.exception.code))
                if salt:
                    self.assertNotIn(salt, str(refused.exception.code))
                self.assertEqual(world.transport.calls, [])
                self.assertFalse(self.out.exists())

    def test_without_the_app_id_or_key_nothing_is_asked(self):
        world = World()
        with self.assertRaises(SystemExit) as refused:
            self.main(world, environ={"SDLC_METRICS_SALT": SALT})
        self.assertIn("SDLC_APP_ID is not set", str(refused.exception.code))
        self.assertIn("SDLC_APP_PRIVATE_KEY", str(refused.exception.code))
        self.assertEqual(world.transport.calls, [])

    def test_an_app_github_refuses_stops_the_run_with_its_status(self):
        world = World()
        world.transport.routes[("GET", "/app/installations")] = json_response({"message": "Bad credentials"}, 401)
        err = io.StringIO()
        with contextlib.redirect_stderr(err):
            status, _ = self.main(world)
        self.assertEqual(status, 1)
        self.assertIn("401 Bad credentials", err.getvalue())
        self.assertFalse(self.out.exists())


if __name__ == "__main__":
    unittest.main()
