"""scripts/permissions.py: which of the owner's installations has yet to
accept a permission, and GitHub's own answer to whether it holds
Administration."""

import importlib.util
import unittest
from pathlib import Path

from tests.fakes import FakeTransport, json_response

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("permissions", ROOT / "scripts" / "permissions.py")
permissions = importlib.util.module_from_spec(spec)
spec.loader.exec_module(permissions)

API = "https://api.example.test"
APP = {"name": "SymphonyBoard", "slug": "symphonyboard",
       "permissions": {"administration": "write", "contents": "write", "metadata": "read"}}
MANIFEST = {"administration": "write", "contents": "write", "metadata": "read"}


def installation(number, login, granted, kind="Organization"):
    return {"id": number, "account": {"login": login, "type": kind}, "repository_selection": "all",
            "permissions": granted}


def routes(installations, invitations_status=200, app=APP):
    table = {
        ("GET", "/app"): json_response(app),
        ("GET", "/app/installations"): json_response(installations),
        ("GET", "/installation/repositories"): json_response(
            {"repositories": [{"full_name": "OpenSpineConsortium/spine-program"}]}),
        ("GET", "/repos/OpenSpineConsortium/spine-program/invitations"): json_response(
            [] if invitations_status == 200 else {"message": "Resource not accessible by integration"},
            status=invitations_status),
    }
    for item in installations:
        table[("POST", f"/app/installations/{item['id']}/access_tokens")] = json_response(
            {"token": "t", "expires_at": "2099-01-01T00:00:00Z"}, status=201)
    return table


def run(installations, invitations_status=200, owners=("openspineconsortium",), app=APP):
    transport = FakeTransport(routes(installations, invitations_status, app), api=API)
    lines, short = permissions.report(lambda: "jwt", set(owners), MANIFEST, transport, API)
    return "\n".join(lines), short, transport


class PermissionsTest(unittest.TestCase):
    def test_an_installation_holding_everything_reads_the_invitations(self):
        text, short, _ = run([installation(7, "OpenSpineConsortium", dict(APP["permissions"]))])
        self.assertFalse(short)
        self.assertIn("holds every permission the App asks for", text)
        self.assertIn("invitations read on 1 of 1 repositories", text)

    def test_an_installation_yet_to_accept_administration_is_named_with_its_page(self):
        granted = {"contents": "write", "metadata": "read"}
        text, short, _ = run([installation(7, "OpenSpineConsortium", granted)], invitations_status=403)
        self.assertTrue(short)
        self.assertIn("not accepted yet: administration; accept them at "
                      "https://github.com/organizations/OpenSpineConsortium/settings/installations/7", text)
        self.assertIn("refused on OpenSpineConsortium/spine-program", text)

    def test_read_where_write_is_asked_falls_short(self):
        self.assertEqual(permissions.short_of({"administration": "write"}, {"administration": "read"}),
                         ["administration"])
        self.assertEqual(permissions.short_of({"metadata": "read"}, {"metadata": "write"}), [])

    def test_a_personal_installation_points_at_the_personal_settings(self):
        page = permissions.settings_page(installation(9, "someone", {}, kind="User"))
        self.assertEqual(page, "https://github.com/settings/installations/9")

    def test_another_account_is_counted_and_never_named(self):
        text, short, transport = run([installation(8, "stranger", {"metadata": "read"})])
        self.assertNotIn("stranger", text)
        self.assertIn("1 other installations, 1 of them yet to accept a permission", text)
        self.assertFalse(short)
        self.assertNotIn(("POST", "/app/installations/8/access_tokens"),
                         [(c["method"], c["path"]) for c in transport.calls])

    def test_a_registration_behind_the_manifest_says_where_to_add_it(self):
        app = dict(APP, permissions={"contents": "write", "metadata": "read"})
        text, short, _ = run([], app=app)
        self.assertTrue(short)
        self.assertIn("lacks what manifest.json asks for: administration", text)

    def test_the_owner_list_takes_commas_spaces_and_any_case(self):
        self.assertEqual(permissions.owners_of({"SYMPHONY_OWNER_ACCOUNTS": "OpenSpineConsortium, Someone"}),
                         {"openspineconsortium", "someone"})


if __name__ == "__main__":
    unittest.main()
