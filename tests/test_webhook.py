import base64
import contextlib
import http.client
import io
import json
import threading
import unittest

from app import webhook
from app.jwt import AppKey
from tests.fakes import HEAD_SHA, REPO, FakeTransport, OpensslKey, json_response, pull, pull_request_event

SECRET = "webhook-secret-for-tests"
WAIT = 10


class SignatureTest(unittest.TestCase):
    def test_the_right_signature_is_accepted(self):
        body = b'{"zen": "Keep it simple."}'
        header = webhook.signature_of(SECRET.encode(), body)
        self.assertTrue(header.startswith("sha256="))
        self.assertTrue(webhook.signature_matches(SECRET.encode(), body, header))

    def test_a_wrong_or_missing_signature_is_refused(self):
        body = b'{"zen": "Keep it simple."}'
        self.assertFalse(webhook.signature_matches(SECRET.encode(), body, webhook.signature_of(b"other", body)))
        self.assertFalse(webhook.signature_matches(SECRET.encode(), body + b" ",
                                                   webhook.signature_of(SECRET.encode(), body)))
        self.assertFalse(webhook.signature_matches(SECRET.encode(), body, None))
        self.assertFalse(webhook.signature_matches(SECRET.encode(), body, ""))
        self.assertFalse(webhook.signature_matches(SECRET.encode(), body, "sha256=" + chr(0xE9)))


class Server:
    """A WebhookServer on a free local port, on a thread of its own."""

    def __init__(self, dispatch):
        self.lines = []
        self.logged = threading.Condition()
        self.server = webhook.WebhookServer(("127.0.0.1", 0), SECRET, dispatch, log=self.log)
        self.thread = threading.Thread(target=self.server.serve_forever, args=(0.05,), daemon=True)
        self.thread.start()

    def log(self, record):
        with self.logged:
            self.lines.append(record)
            self.logged.notify_all()

    def wait_for_lines(self, count):
        """The log lines once there are count of them: a line is written
        after the answer, on another thread, so the test waits for it."""
        with self.logged:
            self.logged.wait_for(lambda: len(self.lines) >= count, WAIT)
            return list(self.lines)

    def request(self, method, path, body=None, headers=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_address[1], timeout=WAIT)
        try:
            connection.request(method, path, body=body, headers=headers or {})
            reply = connection.getresponse()
            return reply.status, reply.read()
        finally:
            connection.close()

    def deliver(self, event, payload, secret=SECRET, delivery="delivery-1"):
        body = json.dumps(payload).encode()
        return self.request("POST", "/webhook", body, {
            "X-GitHub-Event": event, "X-GitHub-Delivery": delivery, "Content-Type": "application/json",
            "X-Hub-Signature-256": webhook.signature_of(secret.encode(), body)})

    def close(self):
        self.server.shutdown()
        self.server.server_close()
        self.server.worker.stop()


class ServerTest(unittest.TestCase):
    def start(self, dispatch):
        server = Server(dispatch)
        self.addCleanup(server.close)
        return server

    def test_202_comes_before_the_event_is_handled(self):
        release, handled = threading.Event(), threading.Event()
        seen = []

        def dispatch(event, payload):
            release.wait(WAIT)
            seen.append((event, payload["action"]))
            handled.set()
            return "handled"

        server = self.start(dispatch)
        status, _ = server.deliver("pull_request", {"action": "opened", "repository": {"full_name": REPO},
                                                    "marker": "body-text-never-logged"})
        self.assertEqual(status, 202)
        self.assertFalse(handled.is_set(), "the answer waited for the handler")
        release.set()
        self.assertTrue(handled.wait(WAIT))
        line = server.wait_for_lines(1)[-1]
        self.assertEqual(seen, [("pull_request", "opened")])
        self.assertEqual({key: line[key] for key in ("delivery", "event", "action", "repository", "outcome")},
                         {"delivery": "delivery-1", "event": "pull_request", "action": "opened",
                          "repository": REPO, "outcome": "handled"})
        self.assertIsInstance(line["duration_ms"], int)
        logged = json.dumps(server.lines)
        self.assertNotIn("body-text-never-logged", logged)
        self.assertNotIn(SECRET, logged)

    def test_a_bad_signature_gets_401_and_is_never_handled(self):
        calls = []
        server = self.start(lambda event, payload: calls.append(event))
        status, _ = server.deliver("pull_request", {"action": "opened"}, secret="not-the-secret")
        self.assertEqual(status, 401)
        status, _ = server.request("POST", "/webhook", b"{}", {"X-GitHub-Event": "push"})
        self.assertEqual(status, 401)
        lines = server.wait_for_lines(2)
        server.server.worker.wait()
        self.assertEqual(calls, [])
        self.assertEqual([line["outcome"] for line in lines], ["refused: the signature does not match"] * 2)
        self.assertEqual(lines[0]["delivery"], "delivery-1")

    def test_a_signed_body_that_is_not_json_gets_400(self):
        server = self.start(lambda event, payload: "handled")
        body = b"not json"
        status, _ = server.request("POST", "/webhook", body, {
            "X-GitHub-Event": "push", "X-Hub-Signature-256": webhook.signature_of(SECRET.encode(), body)})
        self.assertEqual(status, 400)

    def test_health_and_unknown_paths(self):
        server = self.start(lambda event, payload: "handled")
        self.assertEqual(server.request("GET", "/health"), (200, b"ok\n"))
        self.assertEqual(server.request("GET", "/webhook")[0], 404)
        self.assertEqual(server.request("POST", "/elsewhere", b"{}")[0], 404)

    def test_a_handler_that_raises_is_logged_as_an_error(self):
        def dispatch(event, payload):
            raise RuntimeError("GitHub was down")

        server = self.start(dispatch)
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            self.assertEqual(server.deliver("push", {"ref": "refs/heads/main"})[0], 202)
            lines = server.wait_for_lines(1)
        self.assertEqual(lines[-1]["outcome"], "error: RuntimeError: GitHub was down")
        self.assertIn("Traceback", stderr.getvalue())

    def test_the_worker_outlives_a_job_that_raises(self):
        worker = webhook.Worker()
        self.addCleanup(worker.stop)
        done = []
        with contextlib.redirect_stderr(io.StringIO()):
            worker.submit(lambda: 1 / 0)
            worker.submit(lambda: done.append(True))
            worker.wait()
        self.assertEqual(done, [True])

    def test_a_server_without_a_secret_does_not_start(self):
        with self.assertRaises(ValueError):
            webhook.WebhookServer(("127.0.0.1", 0), "", lambda event, payload: "")


class ConfigTest(unittest.TestCase):
    def test_missing_settings_are_named_and_never_shown(self):
        with self.assertRaises(SystemExit) as raised:
            webhook.Config.from_environment({"SDLC_APP_PRIVATE_KEY": "key-text-never-shown"})
        message = str(raised.exception)
        self.assertIn("WEBHOOK_SECRET", message)
        self.assertIn("SDLC_APP_ID", message)
        self.assertNotIn("key-text-never-shown", message)

    def test_settings_from_the_environment(self):
        config = webhook.Config.from_environment({"WEBHOOK_SECRET": SECRET, "SDLC_APP_ID": "123456",
                                                  "SDLC_APP_PRIVATE_KEY_PATH": "/k.pem"})
        self.assertEqual((config.port, config.app_id, config.key.path), (3000, "123456", "/k.pem"))
        self.assertNotIn(SECRET, repr(config))


class EndToEndTest(unittest.TestCase):
    """The dispatcher the server runs, from a delivery to the check run,
    against a fake GitHub: the JWT, the installation token, the reads and
    the check run, in that order."""

    @classmethod
    def setUpClass(cls):
        cls.key = OpensslKey()

    @classmethod
    def tearDownClass(cls):
        cls.key.close()

    def test_a_delivery_becomes_a_check_run(self):
        created = []
        routes = {
            ("POST", "/app/installations/99/access_tokens"):
                json_response({"token": "installation-token-for-tests", "expires_at": "2099-01-01T00:00:00Z"}, 201),
            ("GET", f"/repos/{REPO}/pulls/12"): json_response(pull(draft=True)),
            ("GET", f"/repos/{REPO}/contents/docs/agents/claims/7.md"): json_response({"type": "file"}),
            ("GET", f"/repos/{REPO}/commits/{HEAD_SHA}/check-runs"): json_response({"total_count": 0,
                                                                                    "check_runs": []}),
            ("POST", f"/repos/{REPO}/check-runs"): lambda call: created.append(call) or json_response({"id": 1}, 201),
        }
        transport = FakeTransport(routes, "https://api.github.com")
        config = webhook.Config(port=0, app_id="123456", key=AppKey(path=str(self.key.private)), secret=SECRET)
        dispatch = webhook.dispatcher(config, transport)
        outcome = dispatch("pull_request", pull_request_event("opened"))
        self.assertEqual(outcome, f"sdlc/protocol success on {HEAD_SHA[:7]}")
        self.assertEqual(created[0]["body"]["conclusion"], "success")
        app_jwt = transport.calls[0]["headers"]["Authorization"].removeprefix("Bearer ")
        header, claims, signature = app_jwt.split(".")
        padded = signature + "=" * (-len(signature) % 4)
        self.assertTrue(self.key.verifies(f"{header}.{claims}".encode(), base64.urlsafe_b64decode(padded)))
        for call in transport.calls[1:]:
            self.assertEqual(call["headers"]["Authorization"], "Bearer installation-token-for-tests")
        dispatch("pull_request", pull_request_event("edited"))
        self.assertEqual(transport.paths("POST").count("/app/installations/99/access_tokens"), 1)


if __name__ == "__main__":
    unittest.main()
