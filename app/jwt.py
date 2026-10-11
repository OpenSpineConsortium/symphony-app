"""The App's JSON Web Token, the credential GitHub asks of the App itself.

GitHub gives an App an installation token only in exchange for a JWT the
App signed with its private key (RS256). The signature is made by the
openssl binary in a subprocess rather than by a Python package: the
standard library has no RSA, and a package such as PyJWT or cryptography
would be the backend's one dependency to install, pin and keep patched,
where openssl is already in the python:3.12-slim image and on every
machine that runs the tests. The rest of a JWT, JSON and base64url, is
the standard library's.

The key is either a file (SDLC_APP_PRIVATE_KEY_PATH) or the PEM text in
an environment variable (SDLC_APP_PRIVATE_KEY), which is how a container
or an Actions secret hands it over. openssl reads a key only from a file,
so text is written to a temporary file of mode 0600 for the one signature
and removed after it. Nothing here logs, prints or puts into an exception
the key, its path's contents, or the token.
"""

import base64
import json
import os
import subprocess
import tempfile
import time
from contextlib import contextmanager
from dataclasses import dataclass, field

HEADER = {"alg": "RS256", "typ": "JWT"}
# GitHub refuses a JWT that lives longer than ten minutes, and the clock
# of the machine signing it may run ahead of GitHub's: iat a minute in the
# past and exp nine minutes ahead keep inside both limits.
ISSUED_BEFORE = 60
EXPIRES_AFTER = 540
KEY_VARIABLE = "SDLC_APP_PRIVATE_KEY"
KEY_PATH_VARIABLE = "SDLC_APP_PRIVATE_KEY_PATH"
APP_ID_VARIABLE = "SDLC_APP_ID"


class SigningError(Exception):
    """openssl could not sign; the message says why without the key."""


@dataclass(frozen=True)
class AppKey:
    """Where the App's private key is: a path, or the PEM text itself. The
    text is left out of repr, so printing the object never prints a key."""

    path: str | None = None
    text: str | None = field(default=None, repr=False)

    @classmethod
    def from_environment(cls, environ=None):
        environ = os.environ if environ is None else environ
        path = environ.get(KEY_PATH_VARIABLE)
        if path:
            return cls(path=path)
        text = environ.get(KEY_VARIABLE)
        if text:
            return cls(text=text)
        raise SigningError(f"the App's private key is not set: give {KEY_PATH_VARIABLE} "
                           f"or {KEY_VARIABLE}")


def b64url(data):
    """base64url without padding, as RFC 7515 writes every part of a JWT."""
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def compact_json(value):
    return json.dumps(value, separators=(",", ":"), sort_keys=True).encode("utf-8")


def claims(app_id, now):
    return {"iat": int(now) - ISSUED_BEFORE, "exp": int(now) + EXPIRES_AFTER, "iss": str(app_id)}


def signing_input(app_id, now):
    """The header and the claims, encoded and joined: what is signed."""
    return f"{b64url(compact_json(HEADER))}.{b64url(compact_json(claims(app_id, now)))}"


def pem_text(text):
    """The PEM with real newlines, whether it came with them or with the
    escaped ones an env file carries (app/envfile.py)."""
    if "\n" not in text.strip() and "\\n" in text:
        text = text.replace("\\n", "\n")
    return text.strip() + "\n"


@contextmanager
def key_file(key):
    """A path openssl can read the key from, for the length of one use.
    mkstemp already makes the file 0600; the chmod says so in the code and
    holds if a umask or a platform ever made it otherwise."""
    if key.path:
        yield key.path
        return
    descriptor, path = tempfile.mkstemp(prefix="symphony-app-key-", suffix=".pem")
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, "w", encoding="ascii") as handle:
            handle.write(pem_text(key.text))
        yield path
    finally:
        try:
            os.unlink(path)
        except FileNotFoundError:
            pass


def sign(message, key):
    """The RS256 signature of message: SHA-256 and PKCS#1 v1.5, which is
    what openssl dgst -sha256 -sign makes with an RSA key."""
    with key_file(key) as path:
        result = subprocess.run(["openssl", "dgst", "-sha256", "-sign", path],
                                input=message, capture_output=True, check=False)
    if result.returncode != 0:
        # openssl's own complaint names the problem (an unreadable or
        # malformed key) and never echoes the key's contents.
        reason = result.stderr.decode("utf-8", "replace").strip().splitlines()
        raise SigningError("openssl could not sign the App's JWT: "
                           + (reason[0] if reason else f"exit {result.returncode}"))
    return result.stdout


def app_jwt(app_id, key, now=None):
    """A JWT for the App, valid for about nine minutes from now."""
    now = time.time() if now is None else now
    message = signing_input(app_id, now)
    return f"{message}.{b64url(sign(message.encode('ascii'), key))}"
