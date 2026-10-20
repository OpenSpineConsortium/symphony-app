"""scripts/deploy_signin.py: the upload keeps the Worker's settings and picks its account."""

import importlib.util
import json
import os
import pathlib
import unittest
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parent.parent
SPEC = importlib.util.spec_from_file_location("deploy_signin", ROOT / "scripts" / "deploy_signin.py")
deploy_signin = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(deploy_signin)


class UploadMetadataTest(unittest.TestCase):
    def test_keeps_every_binding_kind_and_the_settings_the_page_holds(self):
        settings = {
            "bindings": [
                {"type": "secret_text", "name": "GITHUB_CLIENT_SECRET"},
                {"type": "plain_text", "name": "GITHUB_CLIENT_ID"},
                {"type": "secret_text", "name": "MICROSOFT_CLIENT_SECRET"},
                {"type": "ratelimit", "name": "RATE_LIMITER"},
            ],
            "compatibility_date": "2026-10-01",
            "compatibility_flags": ["nodejs_compat"],
            "observability": {"enabled": False},
        }
        metadata = deploy_signin.upload_metadata(settings)
        self.assertEqual(metadata["main_module"], "worker.js")
        self.assertEqual(metadata["keep_bindings"], ["plain_text", "ratelimit", "secret_text"])
        self.assertEqual(metadata["compatibility_date"], "2026-10-01")
        self.assertEqual(metadata["compatibility_flags"], ["nodejs_compat"])
        self.assertEqual(metadata["observability"], {"enabled": False}, "the logs the README turns off came back on")

    def test_no_settings_sends_the_code_alone(self):
        self.assertEqual(deploy_signin.upload_metadata(None), {"main_module": "worker.js", "keep_bindings": []})


class PickAccountTest(unittest.TestCase):
    def test_the_only_account(self):
        self.assertEqual(deploy_signin.pick_account([{"id": "a1"}], ""), "a1")

    def test_several_accounts_need_the_variable(self):
        with self.assertRaises(deploy_signin.DeployError):
            deploy_signin.pick_account([{"id": "a1"}, {"id": "a2"}], "")
        self.assertEqual(deploy_signin.pick_account([{"id": "a1"}, {"id": "a2"}], "a2"), "a2")

    def test_an_account_the_token_does_not_reach_is_refused(self):
        with self.assertRaises(deploy_signin.DeployError):
            deploy_signin.pick_account([{"id": "a1"}], "a9")


class MultipartTest(unittest.TestCase):
    def test_the_form_holds_the_metadata_then_the_module(self):
        body, kind = deploy_signin.multipart({"main_module": "worker.js"}, b"export default {};\n")
        boundary = kind.split("boundary=", 1)[1]
        self.assertTrue(kind.startswith("multipart/form-data; "))
        parts = body.split(("--" + boundary).encode("ascii"))
        self.assertEqual(parts[-1], b"--\r\n")
        self.assertIn(b'name="metadata"', parts[1])
        self.assertEqual(json.loads(parts[1].split(b"\r\n\r\n", 1)[1].strip()), {"main_module": "worker.js"})
        self.assertIn(b'name="worker.js"', parts[2])
        self.assertIn(b"Content-Type: application/javascript+module", parts[2])
        self.assertIn(b"export default {};", parts[2])


class MainTest(unittest.TestCase):
    def test_no_token_ends_green_with_a_notice(self):
        with mock.patch.dict(os.environ, {"CLOUDFLARE_API_TOKEN": ""}):
            self.assertEqual(deploy_signin.main(), 0)


if __name__ == "__main__":
    unittest.main()
