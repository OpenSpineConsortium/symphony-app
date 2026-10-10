import unittest

from app import github
from tests.fakes import HEAD_SHA, REPO, FakeTransport, json_response

API = "https://api.example.test"
TOKEN = "installation-token-for-tests"


class StaticTokens:
    def token(self, installation_id):
        return TOKEN


def client(routes):
    transport = FakeTransport(routes, API)
    return github.Client(StaticTokens(), 99, transport, API), transport


class ClientTest(unittest.TestCase):
    def test_every_call_carries_the_version_json_and_the_token(self):
        api, transport = client({("GET", f"/repos/{REPO}/pulls/12"): json_response({"number": 12})})
        self.assertEqual(api.pull_request(REPO, 12), {"number": 12})
        headers = transport.calls[0]["headers"]
        self.assertEqual(headers["X-GitHub-Api-Version"], "2022-11-28")
        self.assertEqual(headers["Accept"], "application/vnd.github+json")
        self.assertEqual(headers["Authorization"], f"Bearer {TOKEN}")
        self.assertIn("User-Agent", headers)

    def test_pages_are_followed_by_link_until_the_last(self):
        path = f"/repos/{REPO}/commits/{HEAD_SHA}/check-runs"
        pages = iter([
            json_response({"total_count": 3, "check_runs": [{"id": 1}, {"id": 2}]},
                          headers={"link": f'<{API}{path}?page=2>; rel="next", <{API}{path}?page=2>; rel="last"'}),
            json_response({"total_count": 3, "check_runs": [{"id": 3}]},
                          headers={"link": f'<{API}{path}?page=1>; rel="first"'}),
        ])
        api, transport = client({("GET", path): lambda call: next(pages)})
        runs = api.check_runs(REPO, HEAD_SHA, name="sdlc/protocol", app_id="123")
        self.assertEqual([run["id"] for run in runs], [1, 2, 3])
        first = transport.calls[0]["query"]
        self.assertEqual(first["check_name"], ["sdlc/protocol"])
        self.assertEqual(first["app_id"], ["123"])
        self.assertEqual(first["per_page"], ["100"])
        self.assertEqual(transport.calls[1]["query"], {"page": ["2"]})

    def test_a_check_run_is_created_completed_with_its_output(self):
        api, transport = client({("POST", f"/repos/{REPO}/check-runs"): json_response({"id": 5}, 201)})
        api.create_check_run(REPO, "sdlc/protocol", HEAD_SHA, "failure", "1 problem", "- it broke")
        self.assertEqual(transport.calls[0]["body"], {
            "name": "sdlc/protocol", "head_sha": HEAD_SHA, "status": "completed", "conclusion": "failure",
            "output": {"title": "1 problem", "summary": "- it broke"}})
        self.assertEqual(transport.calls[0]["headers"]["Content-Type"], "application/json")

    def test_file_existence_on_a_ref(self):
        path = f"/repos/{REPO}/contents/docs/agents/claims/7.md"
        api, transport = client({("GET", path): json_response({"type": "file", "path": "docs/agents/claims/7.md"})})
        self.assertTrue(api.file_exists(REPO, "docs/agents/claims/7.md", HEAD_SHA))
        self.assertEqual(transport.calls[0]["query"], {"ref": [HEAD_SHA]})
        self.assertFalse(api.file_exists(REPO, "docs/agents/claims/8.md", HEAD_SHA))

    def test_a_directory_is_not_a_file(self):
        path = f"/repos/{REPO}/contents/docs/agents/claims/7.md"
        api, _ = client({("GET", path): json_response([{"type": "file"}])})
        self.assertFalse(api.file_exists(REPO, "docs/agents/claims/7.md", HEAD_SHA))

    def test_a_server_error_raises_with_no_token_in_the_message(self):
        path = f"/repos/{REPO}/contents/docs/agents/claims/7.md"
        api, _ = client({("GET", path): json_response({"message": "Server Error"}, 502)})
        with self.assertRaises(github.GitHubError) as raised:
            api.file_exists(REPO, "docs/agents/claims/7.md", HEAD_SHA)
        self.assertEqual(raised.exception.status, 502)
        self.assertIn("Server Error", str(raised.exception))
        self.assertNotIn(TOKEN, str(raised.exception))

    def test_an_issue_comment(self):
        api, transport = client({("POST", f"/repos/{REPO}/issues/7/comments"): json_response({"id": 1}, 201)})
        api.create_issue_comment(REPO, 7, "main moved")
        self.assertEqual(transport.calls[0]["body"], {"body": "main moved"})

    def test_patch_sends_its_body(self):
        api, transport = client({("PATCH", f"/repos/{REPO}/issues/7"): json_response({"number": 7})})
        api.patch(f"/repos/{REPO}/issues/7", {"state": "open"})
        self.assertEqual(transport.calls[0]["body"], {"state": "open"})

    def test_next_page_reads_only_rel_next(self):
        self.assertIsNone(github.next_page({"link": '<https://x/a?page=1>; rel="prev"'}))
        self.assertIsNone(github.next_page({}))


class TokenCacheTest(unittest.TestCase):
    def setUp(self):
        self.now = 1_790_000_000
        self.granted = 0

        def grant(call):
            self.granted += 1
            expires = "2026-09-21T15:13:20Z"  # 1790000000 + 3600 seconds
            return json_response({"token": f"token-{self.granted}", "expires_at": expires}, 201)

        self.transport = FakeTransport({("POST", "/app/installations/99/access_tokens"): grant,
                                        ("POST", "/app/installations/42/access_tokens"): grant}, API)
        self.tokens = github.InstallationTokens(lambda: "app-jwt-for-tests", self.transport, API,
                                                clock=lambda: self.now)

    def test_the_token_is_asked_for_with_the_app_jwt(self):
        self.assertEqual(self.tokens.token(99), "token-1")
        self.assertEqual(self.transport.calls[0]["headers"]["Authorization"], "Bearer app-jwt-for-tests")

    def test_a_token_is_kept_until_five_minutes_before_it_expires(self):
        self.assertEqual(github.expiry_of("2026-09-21T15:13:20Z"), 1_790_000_000 + 3600)
        self.assertEqual(self.tokens.token(99), "token-1")
        self.now += 3600 - 301
        self.assertEqual(self.tokens.token(99), "token-1")
        self.assertEqual(self.granted, 1)
        self.now += 2
        self.assertEqual(self.tokens.token(99), "token-2")
        self.assertEqual(self.granted, 2)

    def test_a_token_carries_the_whole_grant_unless_permissions_name_less(self):
        self.tokens.token(99)
        self.assertEqual(self.transport.calls[0]["body"], {})
        narrowed = github.InstallationTokens(lambda: "app-jwt-for-tests", self.transport, API,
                                             clock=lambda: self.now, permissions={"contents": "read"})
        narrowed.token(42)
        self.assertEqual(self.transport.calls[1]["body"], {"permissions": {"contents": "read"}})

    def test_each_installation_has_its_own_token(self):
        self.assertEqual(self.tokens.token(99), "token-1")
        self.assertEqual(self.tokens.token(42), "token-2")
        self.assertEqual(self.tokens.token(99), "token-1")
        self.assertEqual(self.transport.paths("POST"), ["/app/installations/99/access_tokens",
                                                        "/app/installations/42/access_tokens"])


if __name__ == "__main__":
    unittest.main()
