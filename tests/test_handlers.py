import unittest

from app import handlers
from tests.fakes import HEAD_SHA, REPO, pull, pull_request_event

APP_ID = "123456"


class FakeClient:
    """The calls check_pull_request makes, answered from a pull request,
    the files at its head and the check runs already there."""

    def __init__(self, pull_request, files=(), runs=()):
        self.pull_request_value = pull_request
        self.files = set(files)
        self.runs = list(runs)
        self.lookups = []
        self.created = []

    def pull_request(self, repo, number):
        return self.pull_request_value

    def file_exists(self, repo, path, ref):
        self.lookups.append((repo, path, ref))
        return path in self.files

    def check_runs(self, repo, ref, name=None, app_id=None):
        return list(self.runs)

    def create_check_run(self, repo, name, head_sha, conclusion, title, summary):
        self.created.append({"repo": repo, "name": name, "head_sha": head_sha, "conclusion": conclusion,
                             "title": title, "summary": summary})
        return {"id": len(self.created)}


def run(client, action="opened", installation=99):
    event = pull_request_event(action, client.pull_request_value, installation)
    clients = []

    def client_for(installation_id):
        clients.append(installation_id)
        return client

    outcome = handlers.handle("pull_request", event, client_for, app_id=APP_ID)
    return outcome, clients


class ProtocolCheckRunTest(unittest.TestCase):
    def only_run(self, client):
        self.assertEqual(len(client.created), 1)
        created = client.created[0]
        self.assertEqual(created["name"], "sdlc/protocol")
        self.assertEqual(created["head_sha"], HEAD_SHA)
        self.assertEqual(created["repo"], REPO)
        return created

    def test_a_draft_with_its_claim_file_passes(self):
        client = FakeClient(pull(draft=True), files={"docs/agents/claims/7.md"})
        outcome, clients = run(client)
        created = self.only_run(client)
        self.assertEqual(created["conclusion"], "success")
        self.assertEqual(created["summary"], "The pull request keeps the claim protocol.")
        self.assertEqual(clients, [99])
        self.assertEqual(client.lookups, [(REPO, "docs/agents/claims/7.md", HEAD_SHA)])
        self.assertEqual(outcome, f"sdlc/protocol success on {HEAD_SHA[:7]}")

    def test_a_draft_without_its_claim_file_fails(self):
        client = FakeClient(pull(draft=True))
        outcome, _ = run(client)
        created = self.only_run(client)
        self.assertEqual(created["conclusion"], "failure")
        self.assertIn("docs/agents/claims/7.md is missing", created["summary"])
        self.assertEqual(created["title"], "1 problem with the claim protocol")
        self.assertEqual(outcome, f"sdlc/protocol failure on {HEAD_SHA[:7]}: 1 problem with the claim protocol")

    def test_a_ready_pull_request_still_carrying_its_claim_file_fails(self):
        client = FakeClient(pull(draft=False), files={"docs/agents/claims/7.md"})
        run(client, "ready_for_review")
        created = self.only_run(client)
        self.assertEqual(created["conclusion"], "failure")
        self.assertIn("docs/agents/claims/7.md is still here", created["summary"])

    def test_a_ready_pull_request_that_deleted_its_claim_file_passes(self):
        client = FakeClient(pull(draft=False))
        run(client, "ready_for_review")
        self.assertEqual(self.only_run(client)["conclusion"], "success")

    def test_a_body_that_does_not_close_its_issue_fails(self):
        client = FakeClient(pull(body="Works on #7"), files={"docs/agents/claims/7.md"})
        run(client, "edited")
        created = self.only_run(client)
        self.assertEqual(created["conclusion"], "failure")
        self.assertIn("the body does not close #7", created["summary"])
        self.assertTrue(created["summary"].startswith("- "))

    def test_every_problem_is_one_line_of_the_summary(self):
        client = FakeClient(pull(body="", draft=True, head_repo="someone/fork"))
        run(client)
        created = self.only_run(client)
        self.assertEqual(len(created["summary"].splitlines()), 3)
        self.assertEqual(created["title"], "3 problems with the claim protocol")

    def test_a_branch_that_is_not_a_claim_passes_untouched(self):
        client = FakeClient(pull(branch="dependabot/pip/x", body=""))
        run(client)
        created = self.only_run(client)
        self.assertEqual(created["conclusion"], "success")
        self.assertIn("not a claim branch", created["title"])
        self.assertEqual(client.lookups, [])

    def test_the_same_verdict_already_on_the_commit_is_not_made_twice(self):
        earlier = {"id": 3, "name": "sdlc/protocol", "status": "completed", "conclusion": "success",
                   "app": {"id": int(APP_ID)}, "output": {"summary": handlers.KEPT}}
        client = FakeClient(pull(draft=True), files={"docs/agents/claims/7.md"}, runs=[earlier])
        outcome, _ = run(client, "edited")
        self.assertEqual(client.created, [])
        self.assertTrue(outcome.startswith("unchanged"))

    def test_a_new_verdict_replaces_an_old_one(self):
        earlier = {"id": 3, "name": "sdlc/protocol", "status": "completed", "conclusion": "failure",
                   "app": {"id": int(APP_ID)}, "output": {"summary": "- old"}}
        client = FakeClient(pull(draft=True), files={"docs/agents/claims/7.md"}, runs=[earlier])
        run(client, "synchronize")
        self.assertEqual(self.only_run(client)["conclusion"], "success")

    def test_another_apps_run_of_the_same_name_does_not_count(self):
        other = {"id": 3, "name": "sdlc/protocol", "status": "completed", "conclusion": "success",
                 "app": {"id": 1}, "output": {"summary": handlers.KEPT}}
        client = FakeClient(pull(draft=True), files={"docs/agents/claims/7.md"}, runs=[other])
        run(client)
        self.assertEqual(self.only_run(client)["conclusion"], "success")


class OtherEventsTest(unittest.TestCase):
    def never(self, installation_id):
        raise AssertionError("no client is made for an ignored event")

    def test_other_events_are_ignored_for_now(self):
        for event in ("issues", "issue_comment", "push", "check_suite", "installation"):
            outcome = handlers.handle(event, {"action": "opened"}, self.never)
            self.assertTrue(outcome.startswith("ignored"), event)
            self.assertIn("Actions", outcome)

    def test_pull_request_actions_the_check_does_not_read_are_ignored(self):
        outcome = handlers.handle("pull_request", pull_request_event("labeled"), self.never)
        self.assertTrue(outcome.startswith("ignored"))

    def test_ping_is_answered(self):
        self.assertEqual(handlers.handle("ping", {"zen": "Keep it simple."}, self.never), "pong")

    def test_an_event_without_an_installation_is_ignored(self):
        event = pull_request_event()
        del event["installation"]
        self.assertTrue(handlers.handle("pull_request", event, self.never).startswith("ignored"))


if __name__ == "__main__":
    unittest.main()
