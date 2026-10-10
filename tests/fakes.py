"""Stand-ins for GitHub, shared by the tests: a transport that answers
from a table, the pull requests and events GitHub would send, and an
openssl key made for the run."""

import json
import subprocess
import tempfile
import urllib.parse
from pathlib import Path

from app.github import Response

REPO = "OpenSpineConsortium/example"
HEAD_SHA = "0123456789abcdef0123456789abcdef01234567"


class FakeTransport:
    """Answers each request from routes, a dict from (method, path) to a
    Response or a function of the request returning one; the path has no
    host and no query. Every request is kept in calls for the asserts."""

    def __init__(self, routes, api="https://api.example.test"):
        self.routes = routes
        self.api = api
        self.calls = []

    def __call__(self, method, url, headers, body):
        parts = urllib.parse.urlsplit(url)
        call = {"method": method, "path": parts.path, "query": urllib.parse.parse_qs(parts.query),
                "headers": headers, "body": json.loads(body) if body else None, "url": url}
        self.calls.append(call)
        answer = self.routes.get((method, parts.path))
        if answer is None:
            return Response(404, {}, b'{"message": "Not Found"}')
        return answer(call) if callable(answer) else answer

    def paths(self, method=None):
        return [call["path"] for call in self.calls if method in (None, call["method"])]


def json_response(value, status=200, headers=None):
    return Response(status, headers or {}, json.dumps(value).encode("utf-8"))


def pull(branch="claude/7", body="Closes #7", draft=True, number=12, head_repo=REPO, base_repo=REPO,
         sha=HEAD_SHA):
    return {
        "number": number,
        "draft": draft,
        "body": body,
        "head": {"ref": branch, "sha": sha, "repo": {"full_name": head_repo}},
        "base": {"ref": "main", "repo": {"full_name": base_repo}},
    }


def pull_request_event(action="opened", pull_request=None, installation=99):
    pull_request = pull_request or pull()
    return {
        "action": action,
        "number": pull_request["number"],
        "pull_request": pull_request,
        "repository": {"full_name": REPO},
        "installation": {"id": installation},
    }


class OpensslKey:
    """An RSA key pair made by openssl for one test class, and a check of
    a signature against it the way openssl would verify an RS256 JWT."""

    def __init__(self):
        self.directory = tempfile.TemporaryDirectory()
        root = Path(self.directory.name)
        self.private = root / "key.pem"
        self.public = root / "public.pem"
        subprocess.run(["openssl", "genrsa", "-out", str(self.private), "2048"], check=True, capture_output=True)
        subprocess.run(["openssl", "rsa", "-in", str(self.private), "-pubout", "-out", str(self.public)],
                       check=True, capture_output=True)

    def text(self):
        return self.private.read_text(encoding="ascii")

    def verifies(self, message, signature):
        signature_file = Path(self.directory.name) / "signature.bin"
        signature_file.write_bytes(signature)
        result = subprocess.run(["openssl", "dgst", "-sha256", "-verify", str(self.public),
                                 "-signature", str(signature_file)],
                                input=message, capture_output=True, check=False)
        return result.returncode == 0

    def close(self):
        self.directory.cleanup()
