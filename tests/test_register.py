import contextlib
import html
import http.client
import importlib.util
import io
import json
import os
import re
import stat
import tempfile
import threading
import unittest
from http.server import HTTPServer
from pathlib import Path

from app import envfile
from app.github import Response

ROOT = Path(__file__).resolve().parent.parent
SPEC = importlib.util.spec_from_file_location("register", ROOT / "scripts" / "register.py")
register = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(register)

PEM = "-----BEGIN RSA PRIVATE KEY-----\nAAAA\nBBBB\n-----END RSA PRIVATE KEY-----\n"
STATE = "state-for-tests"


def converted(webhook_secret="webhook-secret-from-github"):
    return {"id": 123456, "slug": "sdlc", "pem": PEM, "webhook_secret": webhook_secret,
            "client_id": "client-id", "client_secret": "client-secret-never-written"}


class RegistrationTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.env_path = Path(self.directory.name) / ".sdlc-app.env"
        self.codes = []

    def registration(self, answer=None):
        def convert(code):
            self.codes.append(code)
            return answer or converted()

        return register.Registration("OpenSpineConsortium", self.env_path, ["OpenSpineConsortium/sdlc-template"],
                                     state=STATE, convert=convert)

    def test_a_return_with_the_wrong_state_is_refused_before_the_code_is_used(self):
        registration = self.registration()
        for query in ("code=c1&state=other", "code=c1", "", "code=c1&state="):
            status, _ = registration.finish(query)
            self.assertEqual(status, 400, query)
        self.assertEqual(self.codes, [])
        self.assertFalse(self.env_path.exists())
        self.assertFalse(registration.done)

    def test_a_return_with_the_state_and_no_code_is_refused(self):
        self.assertEqual(self.registration().finish(f"state={STATE}")[0], 400)
        self.assertFalse(self.env_path.exists())

    def test_the_right_state_converts_the_code_and_writes_a_0600_env_file(self):
        registration = self.registration()
        status, _ = registration.finish(f"code=c1&state={STATE}")
        self.assertEqual(status, 200)
        self.assertEqual(self.codes, ["c1"])
        self.assertEqual(stat.S_IMODE(os.stat(self.env_path).st_mode), 0o600)
        values = envfile.read(self.env_path)
        self.assertEqual(values["SDLC_APP_ID"], "123456")
        self.assertEqual(values["SDLC_APP_SLUG"], "sdlc")
        self.assertEqual(values["WEBHOOK_SECRET"], "webhook-secret-from-github")
        self.assertEqual(values["SDLC_APP_PRIVATE_KEY"].replace("\\n", "\n") + "\n", PEM)
        self.assertNotIn("client-secret-never-written", self.env_path.read_text())
        self.assertTrue(registration.done)

    def test_the_next_steps_are_the_exact_commands(self):
        registration = self.registration()
        registration.finish(f"code=c1&state={STATE}")
        steps = registration.steps
        self.assertIn("https://github.com/apps/sdlc/installations/new", steps)
        self.assertIn("gh variable set SDLC_APP_ID --repo OpenSpineConsortium/sdlc-template --body 123456", steps)
        self.assertIn(f"python3 scripts/register.py --env-file {self.env_path} --print-key"
                      " | gh secret set SDLC_APP_PRIVATE_KEY --repo OpenSpineConsortium/sdlc-template", steps)
        self.assertIn(f"docker run --rm --env-file {self.env_path} -p 3000:3000 sdlc-app", steps)
        self.assertNotIn("AAAA", steps)
        self.assertNotIn("webhook-secret-from-github", steps)

    def test_a_missing_webhook_secret_is_made_here(self):
        registration = self.registration(converted(webhook_secret=None))
        registration.finish(f"code=c1&state={STATE}")
        self.assertRegex(envfile.read(self.env_path)["WEBHOOK_SECRET"], r"^[0-9a-f]{64}$")
        self.assertIn("was made here", registration.steps)

    def test_an_older_env_file_with_a_loose_mode_is_rewritten_0600(self):
        self.env_path.write_text("OLD=1\n")
        os.chmod(self.env_path, 0o644)
        self.registration().finish(f"code=c1&state={STATE}")
        self.assertEqual(stat.S_IMODE(os.stat(self.env_path).st_mode), 0o600)
        self.assertNotIn("OLD", envfile.read(self.env_path))

    def test_main_refuses_to_overwrite_an_env_file(self):
        self.env_path.write_text("SDLC_APP_ID=1\n")
        with contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(register.main(["--org", "o", "--env-file", str(self.env_path)]), 1)
        self.assertEqual(self.env_path.read_text(), "SDLC_APP_ID=1\n")

    def test_print_key_writes_the_pem_to_a_pipe(self):
        envfile.write(self.env_path, {"SDLC_APP_PRIVATE_KEY": envfile.one_line(PEM)})
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            self.assertEqual(register.print_key(self.env_path), 0)
        self.assertEqual(out.getvalue(), PEM)


class EnvFileTest(unittest.TestCase):
    def test_the_environment_wins_over_the_file(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        path = Path(directory.name) / "x.env"
        envfile.write(path, {"PORT": "4000", "SDLC_APP_ID": "1"}, header="two lines\nof header")
        environ = {"PORT": "5000"}
        envfile.load_into_environment(path, environ)
        self.assertEqual(environ, {"PORT": "5000", "SDLC_APP_ID": "1"})

    def test_a_value_of_two_lines_is_refused(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        with self.assertRaises(ValueError):
            envfile.write(Path(directory.name) / "x.env", {"KEY": "a\nb"})


class ConversionTest(unittest.TestCase):
    def test_the_code_is_posted_to_the_conversion_endpoint_without_credentials(self):
        calls = []

        def transport(method, url, headers, body):
            calls.append((method, url, headers))
            return Response(201, {}, json.dumps(converted()).encode())

        self.assertEqual(register.convert("c1", transport)["id"], 123456)
        method, url, headers = calls[0]
        self.assertEqual((method, url), ("POST", "https://api.github.com/app-manifests/c1/conversions"))
        self.assertEqual(headers["X-GitHub-Api-Version"], "2022-11-28")
        self.assertNotIn("Authorization", headers)

    def test_a_refused_conversion_raises(self):
        def transport(method, url, headers, body):
            return Response(404, {}, b'{"message": "Not Found"}')

        with self.assertRaises(register.GitHubError):
            register.convert("expired", transport)


class ManifestTest(unittest.TestCase):
    def test_without_a_webhook_url_the_hook_stays_off(self):
        manifest = register.manifest_for()
        self.assertEqual(manifest["hook_attributes"], {"url": "https://example.invalid/webhook", "active": False})
        self.assertEqual(manifest["redirect_url"], "http://localhost:3010/registered")

    def test_a_webhook_url_turns_the_hook_on(self):
        manifest = register.manifest_for("https://sdlc.example.org/webhook", port=3011)
        self.assertEqual(manifest["hook_attributes"], {"url": "https://sdlc.example.org/webhook", "active": True})
        self.assertEqual(manifest["redirect_url"], "http://localhost:3011/registered")

    def test_the_form_posts_the_manifest_to_the_organization_with_the_state(self):
        manifest = register.manifest_for()
        page = register.form_page("OpenSpineConsortium", STATE, manifest)
        action = re.search(r'<form action="([^"]+)" method="post">', page).group(1)
        self.assertEqual(html.unescape(action),
                         f"https://github.com/organizations/OpenSpineConsortium/settings/apps/new?state={STATE}")
        value = re.search(r'name="manifest" value="([^"]*)"', page).group(1)
        self.assertEqual(json.loads(html.unescape(value)), manifest)


class FlowTest(unittest.TestCase):
    """The local server end to end: the form page, a forged return, the real one."""

    def test_the_server_refuses_a_forged_return_and_accepts_the_real_one(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        env_path = Path(directory.name) / ".sdlc-app.env"
        registration = register.Registration("o", env_path, ["o/sdlc-template"], state=STATE,
                                             convert=lambda code: converted())
        server = HTTPServer(("127.0.0.1", 0), register.handler_for(registration, register.manifest_for()))
        self.addCleanup(server.server_close)
        thread = threading.Thread(target=lambda: [server.handle_request() for _ in range(4)], daemon=True)
        thread.start()

        def get(path):
            connection = http.client.HTTPConnection("127.0.0.1", server.server_address[1], timeout=10)
            try:
                connection.request("GET", path)
                reply = connection.getresponse()
                return reply.status, reply.read().decode()
            finally:
                connection.close()

        status, page = get("/")
        self.assertEqual(status, 200)
        self.assertIn(f"state={STATE}", page)
        self.assertEqual(get("/registered?code=c1&state=forged")[0], 400)
        self.assertEqual(get("/elsewhere")[0], 404)
        self.assertFalse(env_path.exists())
        self.assertEqual(get(f"/registered?code=c1&state={STATE}")[0], 200)
        thread.join(10)
        self.assertEqual(stat.S_IMODE(os.stat(env_path).st_mode), 0o600)

    def test_a_failed_conversion_is_reported_and_writes_nothing(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        env_path = Path(directory.name) / ".sdlc-app.env"

        def refuse(code):
            raise register.GitHubError("POST", "/app-manifests/{code}/conversions", 404, "Not Found")

        registration = register.Registration("o", env_path, ["o/sdlc-template"], state=STATE, convert=refuse)
        server = HTTPServer(("127.0.0.1", 0), register.handler_for(registration, register.manifest_for()))
        self.addCleanup(server.server_close)
        thread = threading.Thread(target=server.handle_request, daemon=True)
        thread.start()
        connection = http.client.HTTPConnection("127.0.0.1", server.server_address[1], timeout=10)
        connection.request("GET", f"/registered?code=c1&state={STATE}")
        reply = connection.getresponse()
        self.assertEqual(reply.status, 502)
        self.assertIn("Not Found", reply.read().decode())
        connection.close()
        thread.join(10)
        self.assertFalse(env_path.exists())
        self.assertFalse(registration.done)


if __name__ == "__main__":
    unittest.main()
