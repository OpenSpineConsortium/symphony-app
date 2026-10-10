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


def converted(webhook_secret="webhook-secret-from-github", slug="sdlc"):
    return {"id": 123456, "slug": slug, "pem": PEM, "webhook_secret": webhook_secret,
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



class NameTest(unittest.TestCase):
    def test_a_name_given_replaces_the_manifests_and_none_keeps_it(self):
        """A name an account already holds is refused by GitHub, so the
        registration takes another without editing the manifest."""
        self.assertEqual(register.manifest_for(name="Another Name")["name"], "Another Name")
        self.assertEqual(register.manifest_for()["name"], "OpenSpine SDLC")


class SetupAppTest(unittest.TestCase):
    """The setup App the front door's run uses: its manifest, the steps
    --setup prints, and the flags that keep its file apart from the main
    App's."""

    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.env_path = Path(self.directory.name) / ".sdlc-setup-app.env"

    def registered(self):
        """A registration of the setup App, finished against a fake conversion."""
        registration = register.Registration("OpenSpineConsortium", self.env_path,
                                             ["OpenSpineConsortium/sdlc-start"], state=STATE,
                                             convert=lambda code: converted(None, slug="openspine-sdlc-setup"),
                                             steps=register.next_steps_setup)
        self.assertEqual(registration.finish(f"code=c1&state={STATE}")[0], 200)
        return registration

    def test_the_setup_manifest_asks_for_administration_and_nothing_else(self):
        manifest = register.manifest_for(path=register.MANIFEST_SETUP)
        self.assertEqual(manifest["name"], "OpenSpine SDLC Setup")
        self.assertTrue(manifest["public"])
        self.assertEqual(manifest["default_permissions"], {"administration": "write", "metadata": "read"})
        self.assertEqual(manifest["default_events"], [])
        self.assertEqual(manifest["hook_attributes"], {"url": "https://example.invalid/webhook", "active": False})

    def test_both_manifests_are_json_and_the_setup_one_touches_no_code(self):
        """Administration is all the front door's run needs; a permission
        on contents, issues, pull requests, checks or workflows would let
        a setup token do what only the main App's may."""
        for path in (register.MANIFEST, register.MANIFEST_SETUP):
            json.loads(path.read_text(encoding="ascii"))
        permissions = json.loads(register.MANIFEST_SETUP.read_text(encoding="ascii"))["default_permissions"]
        for name in ("contents", "issues", "pull_requests", "checks", "workflows"):
            self.assertNotIn(name, permissions)

    def test_the_setup_steps_are_the_front_doors_two_settings_and_the_install_link(self):
        steps = self.registered().steps
        self.assertIn("openspine-sdlc-setup (id 123456)", steps)
        self.assertIn("gh variable set SDLC_SETUP_APP_ID --repo OpenSpineConsortium/sdlc-start --body 123456", steps)
        self.assertIn(f"python3 scripts/register.py --env-file {self.env_path} --print-key"
                      " | gh secret set SDLC_SETUP_APP_PRIVATE_KEY --repo OpenSpineConsortium/sdlc-start", steps)
        self.assertIn("https://github.com/apps/openspine-sdlc-setup/installations/new", steps)
        self.assertNotIn("AAAA", steps)
        self.assertNotIn(envfile.read(self.env_path)["WEBHOOK_SECRET"], steps)

    def test_the_setup_steps_never_send_the_reader_to_the_main_apps_settings_or_stage_2(self):
        steps = self.registered().steps
        self.assertNotIn("docker", steps.lower())
        self.assertNotIn("stage 2", steps.lower())
        self.assertNotIn("SDLC_APP_ID", steps)
        self.assertNotIn("SDLC_APP_PRIVATE_KEY", steps)

    def test_the_env_file_keeps_the_main_apps_names_so_print_key_reads_it(self):
        self.registered()
        values = envfile.read(self.env_path)
        self.assertEqual(values["SDLC_APP_ID"], "123456")
        self.assertEqual(values["SDLC_APP_SLUG"], "openspine-sdlc-setup")
        self.assertIn("openspine-sdlc-setup", self.env_path.read_text().splitlines()[0])
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            self.assertEqual(register.print_key(self.env_path), 0)
        self.assertEqual(out.getvalue(), PEM)

    def test_the_form_names_the_setup_app(self):
        page = register.form_page("o", STATE, register.manifest_for(path=register.MANIFEST_SETUP))
        self.assertIn("<title>Register OpenSpine SDLC Setup</title>", page)
        self.assertIn("Register OpenSpine SDLC Setup for o", page)

    def test_main_with_setup_refuses_to_overwrite_the_setup_env_file(self):
        self.env_path.write_text("SDLC_APP_ID=1\n")
        with contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(register.main(["--setup", "--org", "o", "--env-file", str(self.env_path)]), 1)
        self.assertEqual(self.env_path.read_text(), "SDLC_APP_ID=1\n")

    def test_main_with_setup_defaults_to_the_setup_env_file_and_leaves_the_main_apps(self):
        """The main App's .sdlc-app.env is never the default target of
        --setup, so registering the setup App cannot overwrite the only
        copy of the main App's key."""
        self.assertEqual(register.ENV_FILE_SETUP.name, ".sdlc-setup-app.env")
        self.assertNotEqual(register.ENV_FILE_SETUP, register.ENV_FILE)
        self.env_path.write_text("SDLC_APP_ID=1\n")
        self.addCleanup(setattr, register, "ENV_FILE_SETUP", register.ENV_FILE_SETUP)
        register.ENV_FILE_SETUP = self.env_path
        error = io.StringIO()
        with contextlib.redirect_stderr(error):
            self.assertEqual(register.main(["--setup", "--org", "o"]), 1)
        self.assertIn(str(self.env_path), error.getvalue())

    def test_a_webhook_url_with_setup_is_a_usage_error(self):
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            register.main(["--setup", "--org", "o", "--webhook-url", "https://x.example/webhook",
                           "--env-file", str(self.env_path)])
        self.assertFalse(self.env_path.exists())

    def test_the_setup_env_file_is_ignored_by_git_and_docker(self):
        for ignore in (".gitignore", ".dockerignore"):
            lines = (ROOT / ignore).read_text(encoding="ascii").splitlines()
            self.assertIn(".sdlc-setup-app.env", lines, ignore)


if __name__ == "__main__":
    unittest.main()
