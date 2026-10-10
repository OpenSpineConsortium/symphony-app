import base64
import json
import os
import stat
import subprocess
import unittest
from unittest import mock

from app import envfile, jwt
from tests.fakes import OpensslKey

NOW = 1_790_000_000


def decoded(part):
    return base64.urlsafe_b64decode(part + "=" * (-len(part) % 4))


class JwtTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.key = OpensslKey()

    @classmethod
    def tearDownClass(cls):
        cls.key.close()

    def assert_verifies(self, token):
        header, claims, signature = token.split(".")
        self.assertTrue(self.key.verifies(f"{header}.{claims}".encode("ascii"), decoded(signature)))

    def test_header_and_claims_are_what_github_asks(self):
        token = jwt.app_jwt("123456", jwt.AppKey(path=str(self.key.private)), now=NOW)
        header, claims, _ = token.split(".")
        self.assertEqual(json.loads(decoded(header)), {"alg": "RS256", "typ": "JWT"})
        self.assertEqual(json.loads(decoded(claims)), {"iat": NOW - 60, "exp": NOW + 540, "iss": "123456"})

    def test_parts_are_base64url_without_padding(self):
        token = jwt.app_jwt(7, jwt.AppKey(path=str(self.key.private)), now=NOW)
        self.assertEqual(token.count("."), 2)
        self.assertNotIn("=", token)
        self.assertNotIn("+", token)
        self.assertNotIn("/", token)

    def test_signature_from_a_key_file_verifies_with_openssl(self):
        self.assert_verifies(jwt.app_jwt("123456", jwt.AppKey(path=str(self.key.private)), now=NOW))

    def test_a_changed_claim_no_longer_verifies(self):
        token = jwt.app_jwt("123456", jwt.AppKey(path=str(self.key.private)), now=NOW)
        header, _, signature = token.split(".")
        forged = jwt.b64url(jwt.compact_json({"iat": 0, "exp": NOW + 540, "iss": "1"}))
        self.assertFalse(self.key.verifies(f"{header}.{forged}".encode("ascii"), decoded(signature)))

    def test_key_text_goes_to_a_0600_file_that_is_removed_after(self):
        seen = {}
        real_run = subprocess.run

        def run(args, **kwargs):
            path = args[args.index("-sign") + 1]
            seen["path"] = path
            seen["mode"] = stat.S_IMODE(os.stat(path).st_mode)
            return real_run(args, **kwargs)

        with mock.patch.object(jwt.subprocess, "run", side_effect=run):
            token = jwt.app_jwt("123456", jwt.AppKey(text=self.key.text()), now=NOW)
        self.assert_verifies(token)
        self.assertEqual(seen["mode"], 0o600)
        self.assertFalse(os.path.exists(seen["path"]))

    def test_key_text_with_escaped_newlines_from_an_env_file_signs(self):
        one_line = envfile.one_line(self.key.text())
        self.assertNotIn("\n", one_line)
        self.assert_verifies(jwt.app_jwt("123456", jwt.AppKey(text=one_line), now=NOW))

    def test_a_bad_key_raises_without_the_key_and_leaves_no_file(self):
        text = "-----BEGIN PRIVATE KEY-----\nnot-a-key-at-all\n-----END PRIVATE KEY-----\n"
        made = []
        real_mkstemp = jwt.tempfile.mkstemp

        def mkstemp(**kwargs):
            made.append(real_mkstemp(**kwargs))
            return made[-1]

        with mock.patch.object(jwt.tempfile, "mkstemp", side_effect=mkstemp):
            with self.assertRaises(jwt.SigningError) as raised:
                jwt.app_jwt("123456", jwt.AppKey(text=text), now=NOW)
        self.assertNotIn("not-a-key-at-all", str(raised.exception))
        self.assertFalse(os.path.exists(made[0][1]))

    def test_repr_never_shows_the_key_text(self):
        self.assertNotIn("BEGIN", repr(jwt.AppKey(text=self.key.text())))

    def test_key_from_the_environment(self):
        self.assertEqual(jwt.AppKey.from_environment({"SDLC_APP_PRIVATE_KEY_PATH": "/k.pem",
                                                      "SDLC_APP_PRIVATE_KEY": "text"}).path, "/k.pem")
        self.assertEqual(jwt.AppKey.from_environment({"SDLC_APP_PRIVATE_KEY": "text"}).text, "text")
        with self.assertRaises(jwt.SigningError):
            jwt.AppKey.from_environment({})


if __name__ == "__main__":
    unittest.main()
