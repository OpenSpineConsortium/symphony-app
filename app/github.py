"""A small client for GitHub's REST API, on urllib alone.

Two kinds of credential meet here. The App's JWT (app/jwt.py) is good for
one thing the backend needs: exchanging it for an installation token,
which acts on the repositories of one installation with the permissions
the App was granted. Installation tokens live an hour; InstallationTokens
keeps each until five minutes before its expires_at, so a handler never
starts with a token that runs out mid-call, and asks for a new one only
then. Client makes the calls the handlers use with that token.

The transport, the one function that touches the network, is an argument,
so the tests run every path here against a fake. No token, JWT or body
is ever put into a log line or an exception; an error carries the method,
the path, the status and GitHub's own message.
"""

import json
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime

API = "https://api.github.com"
API_VERSION = "2022-11-28"
USER_AGENT = "symphony-app"
TIMEOUT_SECONDS = 30
# A token is replaced this long before GitHub says it expires.
TOKEN_MARGIN_SECONDS = 300
PER_PAGE = 100
NEXT_LINK = re.compile(r'<([^>]+)>\s*;\s*rel="next"')


@dataclass
class Response:
    status: int
    headers: dict = field(default_factory=dict)
    body: bytes = b""


class GitHubError(Exception):
    def __init__(self, method, path, status, message):
        super().__init__(f"{method} {path}: {status} {message}")
        self.method = method
        self.path = path
        self.status = status


def urllib_transport(method, url, headers, body):
    """Send one request; every status comes back as a Response, so the
    caller reads a 404 as an answer rather than catching it."""
    request = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as reply:
            return Response(reply.status, lower_keys(reply.headers), reply.read())
    except urllib.error.HTTPError as error:
        return Response(error.code, lower_keys(error.headers or {}), error.read() or b"")


def lower_keys(headers):
    return {name.lower(): value for name, value in headers.items()}


def next_page(headers):
    """The URL of the next page from a Link header, or None on the last."""
    match = NEXT_LINK.search(headers.get("link", ""))
    return match.group(1) if match else None


def github_message(body):
    try:
        return json.loads(body or b"{}").get("message", "")
    except (ValueError, AttributeError):
        return ""


def path_of(url, api):
    """The path of an API URL, for an error message without the host."""
    return url[len(api):] if url.startswith(api) else urllib.parse.urlsplit(url).path


class Api:
    """JSON over HTTPS with one credential, given as a callable so the
    credential can be renewed between calls."""

    def __init__(self, authorization, transport=urllib_transport, api=API):
        self.authorization = authorization
        self.transport = transport
        self.api = api

    def headers(self, has_body):
        headers = {
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {self.authorization()}",
            "User-Agent": USER_AGENT,
            "X-GitHub-Api-Version": API_VERSION,
        }
        if has_body:
            headers["Content-Type"] = "application/json"
        return headers

    def url(self, path, params=None):
        url = path if path.startswith("https://") else f"{self.api}{path}"
        if params:
            url += ("&" if "?" in url else "?") + urllib.parse.urlencode(params)
        return url

    def send(self, method, url, body=None):
        data = None if body is None else json.dumps(body).encode("utf-8")
        return self.transport(method, url, self.headers(data is not None), data)

    def request(self, method, path, body=None, params=None, allow=()):
        """The decoded JSON of a call; a status of 400 or more raises,
        except the ones in allow, which come back as None."""
        url = self.url(path, params)
        reply = self.send(method, url, body)
        if reply.status in allow:
            return None
        if reply.status >= 400:
            raise GitHubError(method, path_of(url, self.api), reply.status, github_message(reply.body))
        return json.loads(reply.body) if reply.body else None

    def get(self, path, params=None):
        return self.request("GET", path, params=params)

    def post(self, path, body):
        return self.request("POST", path, body=body)

    def patch(self, path, body):
        return self.request("PATCH", path, body=body)

    def get_all(self, path, params=None, key=None):
        """Every item of a list endpoint, following Link rel="next". Some
        endpoints wrap their list in an object; key names the list then."""
        items = []
        url = self.url(path, dict(params or {}, per_page=PER_PAGE))
        while url:
            reply = self.send("GET", url)
            if reply.status >= 400:
                raise GitHubError("GET", path_of(url, self.api), reply.status, github_message(reply.body))
            page = json.loads(reply.body)
            items.extend(page[key] if key else page)
            url = next_page(reply.headers)
        return items


def expiry_of(text):
    """expires_at as GitHub writes it (2026-10-10T12:00:00Z), in epoch seconds."""
    return datetime.fromisoformat(text.replace("Z", "+00:00")).timestamp()


class InstallationTokens:
    """Installation tokens, one per installation, each kept until five
    minutes before it expires. A lock makes the cache safe for the
    server's threads: two events for one installation ask GitHub once.

    A token carries every permission the installation granted the App,
    unless permissions names fewer: a caller that only reads, such as
    scripts/collect.py, asks for a token that can do nothing else."""

    def __init__(self, app_jwt, transport=urllib_transport, api=API, clock=time.time, permissions=None):
        self.app_jwt = app_jwt
        self.transport = transport
        self.api = api
        self.clock = clock
        self.permissions = permissions
        self.cache = {}
        self.lock = threading.Lock()

    def token(self, installation_id):
        with self.lock:
            cached = self.cache.get(installation_id)
            if cached and self.clock() < cached[1] - TOKEN_MARGIN_SECONDS:
                return cached[0]
            body = {"permissions": self.permissions} if self.permissions else {}
            granted = Api(self.app_jwt, self.transport, self.api).post(
                f"/app/installations/{int(installation_id)}/access_tokens", body)
            self.cache[installation_id] = (granted["token"], expiry_of(granted["expires_at"]))
            return granted["token"]


def quoted(path):
    return urllib.parse.quote(path, safe="/")


class Client(Api):
    """The calls the handlers make, on one installation's token. A
    repository is named by its full name, owner/name, as events carry it."""

    def __init__(self, tokens, installation_id, transport=urllib_transport, api=API):
        super().__init__(lambda: tokens.token(installation_id), transport, api)

    def pull_request(self, repo, number):
        return self.get(f"/repos/{repo}/pulls/{int(number)}")

    def check_runs(self, repo, ref, name=None, app_id=None):
        params = {}
        if name:
            params["check_name"] = name
        if app_id:
            params["app_id"] = app_id
        return self.get_all(f"/repos/{repo}/commits/{quoted(ref)}/check-runs", params, key="check_runs")

    def create_check_run(self, repo, name, head_sha, conclusion, title, summary):
        return self.post(f"/repos/{repo}/check-runs", {
            "name": name,
            "head_sha": head_sha,
            "status": "completed",
            "conclusion": conclusion,
            "output": {"title": title, "summary": summary},
        })

    def file_exists(self, repo, path, ref):
        """Whether path is a file at ref; GitHub's 404 means it is not."""
        found = self.request("GET", f"/repos/{repo}/contents/{quoted(path)}", params={"ref": ref}, allow=(404,))
        return isinstance(found, dict) and found.get("type") == "file"

    def create_issue_comment(self, repo, number, body):
        return self.post(f"/repos/{repo}/issues/{int(number)}/comments", {"body": body})
